import Anthropic from "@anthropic-ai/sdk";
import type { Market, NewsArticle, Analysis } from "./types.js";

const CLAUDE_MODEL = "claude-3-5-haiku-20241022";

export async function analyzeMarket(market: Market, news: NewsArticle[]): Promise<Analysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const anthropic = new Anthropic({
    apiKey,
  });

  const prompt = buildAnalysisPrompt(market, news);

  try {
    console.log(`🧠 Analyzing market: ${market.question.substring(0, 50)}...`);

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      temperature: 0.1,
      system: "You are a prediction market analyst. Analyze this market and the provided news. Respond ONLY in valid JSON format with no other text.",
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

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (typeof parsed.aiProbability !== "number" || typeof parsed.confidence !== "number") {
      throw new Error("Invalid Claude response format");
    }

    const aiProbability = Math.max(0, Math.min(1, parsed.aiProbability));
    const confidence = Math.max(0, Math.min(100, parsed.confidence));

    // Calculate edge
    let edge: number;
    let direction: "YES" | "NO" | "SKIP";

    if (parsed.direction === "SKIP") {
      direction = "SKIP";
      edge = 0;
    } else if (parsed.direction === "NO") {
      direction = "NO";
      edge = market.noPrice - (1 - aiProbability);
    } else {
      direction = "YES";
      edge = aiProbability - market.yesPrice;
    }

    const analysis: Analysis = {
      marketId: market.id,
      question: market.question,
      category: market.category,
      currentYesOdds: market.yesPrice,
      aiProbability,
      edge,
      confidence,
      direction,
      reasoning: parsed.reasoning || "No reasoning provided",
      newsUsed: news,
      recommendedBetSize: 0, // Will be calculated later
      timestamp: new Date().toISOString(),
    };

    console.log(`✅ Analysis complete: ${direction} (${(edge * 100).toFixed(1)}% edge, ${confidence}% confidence)`);
    return analysis;
  } catch (error) {
    console.error("❌ Claude analysis failed:", error);
    throw new Error(`Market analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export function shouldBet(analysis: Analysis): boolean {
  const minConfidence = parseInt(process.env.MIN_CONFIDENCE || "70");
  const minEdge = parseFloat(process.env.MIN_EDGE || "15") / 100;

  return (
    analysis.confidence >= minConfidence &&
    Math.abs(analysis.edge) >= minEdge &&
    analysis.direction !== "SKIP"
  );
}

function buildAnalysisPrompt(market: Market, news: NewsArticle[]): string {
  const newsList = news
    .map((article, i) => {
      const date = new Date(article.publishedAt).toLocaleDateString();
      const content = article.content.substring(0, 500);
      return `${i + 1}. **${article.title}** (${article.source}, ${date})\n   ${content}`;
    })
    .join("\n\n");

  return `Market: ${market.question}
Current YES price: ${(market.yesPrice * 100).toFixed(1)}%
Market end date: ${market.endDate}

Recent news:
${newsList}

Based strictly on the news evidence above, estimate the true probability of YES.
Be conservative - only deviate from market odds if news is clearly significant.
Respond ONLY in this JSON format, no other text:
{
  "aiProbability": 0.0,
  "confidence": 0,
  "direction": "YES|NO|SKIP",
  "reasoning": "2-3 sentence explanation"
}`;
}
