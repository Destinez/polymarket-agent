import Anthropic from "@anthropic-ai/sdk";
import { getStats, getRecentLogs } from "./logger.js";

const CLAUDE_MODEL = "claude-3-5-haiku-20241022";

export async function runWeeklyReview(): Promise<void> {
  console.log("📊 Running weekly performance review...");

  try {
    const stats = await getStats();
    const recentLogs = await getRecentLogs(50);

    // Filter to last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentResolvedLogs = recentLogs.filter(
      (log) => log.outcome !== "PENDING" && new Date(log.createdAt) >= thirtyDaysAgo
    );

    // Group by categories
    const categoryStats = stats.statsByCategory || {};

    // Group by confidence bands
    const confidenceBands: Record<string, { total: number; wins: number; pnl: number }> = {
      "50-60": { total: 0, wins: 0, pnl: 0 },
      "60-70": { total: 0, wins: 0, pnl: 0 },
      "70-80": { total: 0, wins: 0, pnl: 0 },
      "80-90": { total: 0, wins: 0, pnl: 0 },
      "90-100": { total: 0, wins: 0, pnl: 0 },
    };

    recentResolvedLogs.forEach((log) => {
      const band = getConfidenceBand(log.confidence);
      confidenceBands[band].total++;
      if (log.outcome === "WIN") {
        confidenceBands[band].wins++;
      }
      confidenceBands[band].pnl += log.pnl || 0;
    });

    const reviewData = {
      overall: {
        totalBets: stats.totalBets,
        winRate: stats.winRate,
        totalPnL: stats.totalPnL,
        avgEdge: stats.avgEdge,
        avgConfidence: stats.avgConfidence,
      },
      categories: categoryStats,
      confidenceBands,
      recentTrades: recentResolvedLogs.slice(0, 10).map((log) => ({
        question: log.question.substring(0, 50) + "...",
        direction: log.predictedDirection,
        confidence: log.confidence,
        edge: log.edge,
        outcome: log.outcome,
        pnl: log.pnl,
      })),
    };

    const analysis = await analyzePerformance(reviewData);
    printReviewReport(reviewData, analysis);

    // TODO: Save recommendations to Supabase reviews table
    console.log("✅ Weekly review complete");

  } catch (error) {
    console.error("❌ Weekly review failed:", error);
  }
}

export async function printPerformanceReport(): Promise<void> {
  try {
    const stats = await getStats();
    const recentLogs = await getRecentLogs(5);

    console.log(`
══════════════════════════════════════
📊 PERFORMANCE REPORT
══════════════════════════════════════
Overall Stats:
• Total Bets: ${stats.totalBets}
• Win Rate: ${stats.winRate.toFixed(1)}%
• Total P&L: $${stats.totalPnL.toFixed(2)}
• Average Edge: ${(stats.avgEdge * 100).toFixed(1)}%
• Average Confidence: ${stats.avgConfidence.toFixed(1)}%

By Category:
${Object.entries(stats.statsByCategory || {})
  .map(([category, catStats]: [string, any]) =>
    `• ${category}: ${catStats.totalBets} bets, ${catStats.winRate.toFixed(1)}% win rate, $${catStats.totalPnL.toFixed(2)} P&L`
  )
  .join("\n")}

Last 5 Predictions:
${recentLogs
  .map((log) => {
    const outcome = log.outcome === "PENDING" ? "⏳ PENDING" :
                   log.outcome === "WIN" ? "✅ WIN" : "❌ LOSS";
    const pnl = log.pnl ? ` (${log.pnl >= 0 ? "+" : ""}$${log.pnl.toFixed(2)})` : "";
    return `• ${log.question.substring(0, 40)}... → ${log.predictedDirection} (${log.confidence.toFixed(0)}% conf) ${outcome}${pnl}`;
  })
  .join("\n")}
══════════════════════════════════════
    `);
  } catch (error) {
    console.error("❌ Failed to print performance report:", error);
  }
}

async function analyzePerformance(reviewData: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const anthropic = new Anthropic({
    apiKey,
  });

  const prompt = `You are reviewing an AI prediction agent's performance over the last 30 days.

Performance Data:
${JSON.stringify(reviewData, null, 2)}

Identify:
1. Which categories perform best/worst
2. Which confidence bands are actually accurate
3. Any patterns in losses
4. Specific threshold adjustments to improve profitability

Respond in JSON:
{
  "summary": "string",
  "adjustments": {
    "minConfidence": number,
    "minEdge": number,
    "avoidCategories": string[],
    "focusCategories": string[]
  },
  "insights": string[]
}`;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      system: "You are a performance analyst. Respond ONLY in valid JSON format.",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in Claude response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("❌ Performance analysis failed:", error);
    return {
      summary: "Analysis failed",
      adjustments: {},
      insights: ["Unable to analyze performance"],
    };
  }
}

function printReviewReport(reviewData: any, analysis: any): void {
  console.log(`
══════════════════════════════════════
📈 WEEKLY PERFORMANCE REVIEW
══════════════════════════════════════

${analysis.summary}

Recommended Adjustments:
• Min Confidence: ${analysis.adjustments?.minConfidence || "No change"}%
• Min Edge: ${analysis.adjustments?.minEdge || "No change"}%
• Avoid Categories: ${analysis.adjustments?.avoidCategories?.join(", ") || "None"}
• Focus Categories: ${analysis.adjustments?.focusCategories?.join(", ") || "None"}

Key Insights:
${analysis.insights?.map((insight: string) => `• ${insight}`).join("\n") || "No insights available"}

══════════════════════════════════════
  `);
}

function getConfidenceBand(confidence: number): string {
  if (confidence < 60) return "50-60";
  if (confidence < 70) return "60-70";
  if (confidence < 80) return "70-80";
  if (confidence < 90) return "80-90";
  return "90-100";
}
