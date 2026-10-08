import { tavily } from "@tavily/core";
import type { Market, NewsArticle } from "./types.js";

export async function searchNewsForMarket(market: Market): Promise<NewsArticle[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY environment variable is required");
  }

  const tavilyClient = tavily({ apiKey });
  const searchQuery = buildSearchQuery(market.question, market.category);

  try {
    console.log(`🔍 Searching news for: "${searchQuery}"`);

    const response = await tavilyClient.search(searchQuery, {
      searchDepth: "advanced",
      maxResults: 8,
      topic: "news",
      days: 7, // Last 7 days
      includeAnswer: false,
      includeRawContent: false,
      includeImages: false,
    });

    const articles: NewsArticle[] = response.results
      .filter((result: any) => {
        // Filter to last 48 hours
        const publishedAt = new Date(result.published_date || result.created_date || Date.now());
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        return publishedAt >= twoDaysAgo;
      })
      .slice(0, 5) // Max 5 articles
      .map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content?.substring(0, 1000) || "", // Limit content length
        publishedAt: result.published_date || result.created_date || new Date().toISOString(),
        source: result.source || new URL(result.url).hostname,
      }));

    console.log(`📄 Found ${articles.length} relevant news articles`);
    return articles;
  } catch (error) {
    console.error("❌ Tavily search failed:", error);
    throw new Error(`News search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export function buildSearchQuery(question: string, category: string): string {
  // Extract key terms from market question
  const cleanQuestion = question
    .replace(/will\s+/gi, "")
    .replace(/\?/g, "")
    .replace(/vs\.?\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Add category context
  const categoryContext = {
    crypto: "cryptocurrency blockchain price prediction",
    politics: "political election policy government",
    sports: "sports game match tournament",
  };

  const context = categoryContext[category as keyof typeof categoryContext] || "";
  return `${cleanQuestion} ${context}`.trim();
}
