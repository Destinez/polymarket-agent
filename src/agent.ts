import type { Market, Analysis } from "./types.js";
import { getOpenMarkets, checkResolvedMarkets, paperTrade } from "./polymarket.js";
import { searchNewsForMarket } from "./news.js";
import { analyzeMarket, shouldBet } from "./analyzer.js";
import { presentBetForApproval } from "./approval.js";
import { calculateBetSize, getCurrentBankroll } from "./kelly.js";
import { logPrediction } from "./logger.js";

export async function runAgentCycle(): Promise<void> {
  console.log("🤖 Agent cycle starting...");

  try {
    // Check for resolved markets and update outcomes
    await checkResolvedMarkets();

    // Fetch open markets
    const categories = ["crypto", "politics", "sports"];
    const markets = await getOpenMarkets(categories);

    if (markets.length === 0) {
      console.log("📭 No eligible markets found");
      return;
    }

    console.log(`🎯 Analyzing ${markets.length} markets...`);

    let opportunitiesFound = 0;

    // Process markets sequentially to avoid rate limits
    for (const market of markets) {
      try {
        console.log(`\n📊 Processing: ${market.question.substring(0, 60)}...`);

        // Search for news
        const news = await searchNewsForMarket(market);

        // Skip if insufficient news
        if (news.length < 3) {
          console.log(`⏭️  Skipping - only ${news.length} news articles found`);
          await delay(2000); // Rate limiting
          continue;
        }

        // Analyze with Claude
        const analysis = await analyzeMarket(market, news);

        // Check if we should bet
        if (!shouldBet(analysis)) {
          console.log(`⏭️  Skipping - doesn't meet betting criteria`);
          await delay(2000); // Rate limiting
          continue;
        }

        opportunitiesFound++;

        // Calculate bet size
        const bankroll = await getCurrentBankroll();
        const betSize = await calculateBetSize(bankroll, analysis.aiProbability, market.yesPrice);
        analysis.recommendedBetSize = betSize;

        // Present for approval
        const approved = await presentBetForApproval(analysis, betSize);

        // Log the prediction
        await logPrediction(analysis, betSize, approved);

        // Execute paper trade
        await paperTrade(analysis, approved);

        // Rate limiting between analyses
        await delay(2000);

      } catch (error) {
        console.error(`❌ Error processing market ${market.id}:`, error);
        // Continue with next market
      }
    }

    console.log(`✅ Cycle complete. Analyzed ${markets.length} markets, found ${opportunitiesFound} opportunities.`);

  } catch (error) {
    console.error("❌ Agent cycle failed:", error);
    throw error;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
