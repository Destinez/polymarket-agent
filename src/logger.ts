import { createClient } from "@supabase/supabase-js";
import type { Analysis, PredictionLog } from "./types.js";

// Supabase SQL schema:
// CREATE TABLE prediction_logs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   market_id TEXT NOT NULL,
//   question TEXT NOT NULL,
//   category TEXT NOT NULL,
//   predicted_direction TEXT NOT NULL,
//   ai_probability FLOAT NOT NULL,
//   market_odds_at_bet FLOAT NOT NULL,
//   edge FLOAT NOT NULL,
//   confidence FLOAT NOT NULL,
//   bet_size FLOAT NOT NULL,
//   reasoning TEXT NOT NULL,
//   approved BOOLEAN NOT NULL,
//   outcome TEXT DEFAULT 'PENDING',
//   pnl FLOAT DEFAULT 0,
//   resolved_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn("⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set - database logging disabled");
      return null;
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

export async function logPrediction(analysis: Analysis, betSize: number, approved: boolean): Promise<string> {
  const client = getSupabaseClient();

  const log: Omit<PredictionLog, "id"> = {
    marketId: analysis.marketId,
    question: analysis.question,
    category: analysis.category,
    predictedDirection: analysis.direction === "SKIP" ? "YES" : analysis.direction, // Default to YES for SKIP (won't be used anyway)
    aiProbability: analysis.aiProbability,
    marketOddsAtBet: analysis.currentYesOdds,
    edge: analysis.edge,
    confidence: analysis.confidence,
    betSize: betSize,
    reasoning: analysis.reasoning,
    approved,
    outcome: "PENDING",
    pnl: 0,
    createdAt: analysis.timestamp,
  };

  if (!client) {
    console.log("📝 Paper trade logged (Supabase offline)");
    return `paper-trade-${Date.now()}`;
  }

  try {
    const { data, error } = await client
      .from("prediction_logs")
      .insert(log)
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    console.log(`📝 Logged prediction: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error("❌ Failed to log prediction:", error);
    return `error-${Date.now()}`;
  }
}

export async function updateOutcome(marketId: string, outcome: "WIN" | "LOSS", pnl: number): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    console.log(`✅ Updated outcome for market ${marketId}: ${outcome} (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}) (Supabase offline)`);
    return;
  }

  try {
    const { error } = await client
      .from("prediction_logs")
      .update({
        outcome,
        pnl,
        resolvedAt: new Date().toISOString(),
      })
      .eq("market_id", marketId)
      .eq("outcome", "PENDING");

    if (error) {
      throw error;
    }

    console.log(`✅ Updated outcome for market ${marketId}: ${outcome} (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})`);
  } catch (error) {
    console.error("❌ Failed to update outcome:", error);
  }
}

export async function getRecentLogs(limit: number = 10): Promise<PredictionLog[]> {
  const client = getSupabaseClient();

  if (!client) {
    return [];
  }

  try {
    const { data, error } = await client
      .from("prediction_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Failed to fetch recent logs:", error);
    return [];
  }
}

export async function getStats(): Promise<any> {
  const client = getSupabaseClient();

  if (!client) {
    return {
      totalBets: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      winRate: 0,
      totalPnL: 0,
      avgEdge: 0,
      avgConfidence: 0,
      statsByCategory: {},
    };
  }

  if (!client) {
    return {
      totalBets: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      winRate: 0,
      totalPnL: 0,
      avgEdge: 0,
      avgConfidence: 0,
      statsByCategory: {},
    };
  }

  try {
    const { data, error } = await client
      .from("prediction_logs")
      .select("*");

    if (error) {
      throw error;
    }

    const logs = data || [];
    const resolved = logs.filter((log: PredictionLog) => log.outcome !== "PENDING");

    const totalBets = logs.length;
    const wins = resolved.filter((log: PredictionLog) => log.outcome === "WIN").length;
    const losses = resolved.filter((log: PredictionLog) => log.outcome === "LOSS").length;
    const pending = totalBets - resolved.length;

    const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : 0;
    const totalPnL = resolved.reduce((sum: number, log: PredictionLog) => sum + (log.pnl || 0), 0);
    const avgEdge = logs.length > 0 ? logs.reduce((sum: number, log: PredictionLog) => sum + log.edge, 0) / logs.length : 0;
    const avgConfidence = logs.length > 0 ? logs.reduce((sum: number, log: PredictionLog) => sum + log.confidence, 0) / logs.length : 0;

    // Group by category
    const statsByCategory: Record<string, any> = {};
    const categories: string[] = Array.from(new Set(logs.map((log: PredictionLog) => log.category))) as string[];

    categories.forEach((category: string) => {
      const categoryLogs = logs.filter((log: PredictionLog) => log.category === category);
      const categoryResolved = categoryLogs.filter((log: PredictionLog) => log.outcome !== "PENDING");
      const categoryWins = categoryResolved.filter((log: PredictionLog) => log.outcome === "WIN").length;

      statsByCategory[category] = {
        totalBets: categoryLogs.length,
        wins: categoryWins,
        losses: categoryResolved.length - categoryWins,
        winRate: categoryResolved.length > 0 ? (categoryWins / categoryResolved.length) * 100 : 0,
        totalPnL: categoryResolved.reduce((sum: number, log: PredictionLog) => sum + (log.pnl || 0), 0),
      };
    });

    return {
      totalBets,
      wins,
      losses,
      pending,
      winRate,
      totalPnL,
      avgEdge,
      avgConfidence,
      statsByCategory,
    };
  } catch (error) {
    console.error("❌ Failed to fetch stats:", error);
    return {
      totalBets: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      winRate: 0,
      totalPnL: 0,
      avgEdge: 0,
      avgConfidence: 0,
      statsByCategory: {},
    };
  }
}
