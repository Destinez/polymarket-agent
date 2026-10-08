import { ClobClient } from "@polymarket/clob-client";
import type { Market, Analysis } from "./types.js";
import { updateOutcome } from "./logger.js";

let polymarketClient: ClobClient | null = null;

function getPolymarketClient(): ClobClient | null {
  if (!polymarketClient) {
    const apiKey = process.env.POLYMARKET_API_KEY;
    if (!apiKey) {
      console.warn("⚠️  POLYMARKET_API_KEY not set - market fetching disabled");
      return null;
    }

    // Initialize client for Polygon network (mainnet)
    polymarketClient = new ClobClient(
      "https://clob.polymarket.com",
      137, // Polygon chain ID
      undefined, // signer (not needed for read-only operations)
      undefined, // creds (not needed for read-only operations)
      undefined, // signatureType
      undefined, // funderAddress
      undefined, // geoBlockToken
      undefined, // useServerTime
      undefined, // builderConfig
      undefined, // getSigner
      undefined, // retryOnError
      undefined, // tickSizeTtlMs
      false // throwOnError
    );
  }
  return polymarketClient;
}

export async function getOpenMarkets(categories: string[]): Promise<Market[]> {
  const client = getPolymarketClient();
  
  if (!client) {
    console.log("📭 Polymarket API not configured - no markets available");
    return [];
  }

  try {
    console.log(`🔍 Fetching markets for categories: ${categories.join(", ")}`);

    // Get markets with pagination
    const response = await client.getMarkets();
    const allMarkets = response.data;

    // Filter and map markets
    const filteredMarkets = allMarkets
      .filter((market: any) => {
        // Filter by categories
        if (!categories.includes(market.category || "other")) {
          return false;
        }

        // Filter by minimum volume ($10,000)
        const volume = parseFloat(market.volume || "0");
        if (volume < 10000) {
          return false;
        }

        // Filter out markets ending in less than 24 hours
        const endDate = new Date(market.end_date || market.endDate);
        const now = new Date();
        const hoursUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilEnd < 24) {
          return false;
        }

        return true;
      })
      .slice(0, 20) // Max 20 markets per run
      .map((market: any) => ({
        id: market.condition_id || market.id,
        question: market.question || market.title,
        category: market.category || "other",
        yesPrice: parseFloat(market.outcomes?.[0]?.price || market.yes_price || "0"),
        noPrice: parseFloat(market.outcomes?.[1]?.price || market.no_price || "0"),
        volume: parseFloat(market.volume || "0"),
        endDate: market.end_date || market.endDate,
        description: market.description || "",
      }));

    console.log(`📊 Found ${filteredMarkets.length} eligible markets`);
    return filteredMarkets;
  } catch (error) {
    console.error("❌ Failed to fetch markets:", error);
    throw new Error(`Market fetching failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function paperTrade(analysis: Analysis, approved: boolean): Promise<void> {
  if (!approved) {
    console.log("⏭️  Trade not approved, skipping");
    return;
  }

  // Check paper trading mode
  const paperTrading = process.env.PAPER_TRADING === "true";
  if (!paperTrading) {
    throw new Error("PAPER_TRADING must be set to true - real trading not implemented yet");
  }

  console.log(`📝 Recording paper trade: ${analysis.direction} on "${analysis.question.substring(0, 50)}..."`);
  console.log(`💰 Bet size would be: $${analysis.recommendedBetSize.toFixed(2)}`);

  // In paper trading mode, we just log the trade
  // Real execution would happen here in the future
}

export async function checkResolvedMarkets(): Promise<void> {
  const client = getPolymarketClient();

  if (!client) {
    console.log("⏭️  Polymarket API not configured - skipping resolution check");
    return;
  }

  try {
    console.log("🔄 Checking for resolved markets...");

    // Get recently resolved markets
    // Note: This is a simplified approach - in practice you'd need to track
    // which markets were bet on and check their resolution status
    const response = await client.getMarkets();
    const markets = response.data;

    // Filter to recently ended markets
    const recentlyEnded = markets.filter((market: any) => {
      const endDate = new Date(market.end_date || market.endDate);
      const now = new Date();
      const daysSinceEnd = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceEnd >= 0 && daysSinceEnd <= 7; // Last 7 days
    });

    console.log(`📋 Found ${recentlyEnded.length} recently ended markets`);

    // For each resolved market, check if we have pending predictions
    for (const market of recentlyEnded) {
      const marketId = market.condition_id || market.id;
      const outcome = market.winner || market.resolved_outcome;

      if (outcome) {
        // Determine if our prediction was correct
        // This would need to be matched against our logged predictions
        // For now, we'll skip the actual outcome calculation
        console.log(`✅ Market ${marketId} resolved with outcome: ${outcome}`);
      }
    }

  } catch (error) {
    console.error("❌ Failed to check resolved markets:", error);
    // Don't throw - this is not critical for the main flow
  }
}
