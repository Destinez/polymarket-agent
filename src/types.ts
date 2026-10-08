export type Category = "crypto" | "politics" | "sports";

export interface Market {
  id: string;
  question: string;
  category: Category;
  yesPrice: number;
  noPrice: number;
  volume: number;
  endDate: string;
  description: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: string;
  source: string;
}

export interface Analysis {
  marketId: string;
  question: string;
  category: Category;
  currentYesOdds: number;
  aiProbability: number;
  edge: number;
  confidence: number;
  direction: "YES" | "NO" | "SKIP";
  reasoning: string;
  newsUsed: NewsArticle[];
  recommendedBetSize: number;
  timestamp: string;
}

export interface PredictionLog {
  id?: string;
  marketId: string;
  question: string;
  category: Category;
  predictedDirection: "YES" | "NO";
  aiProbability: number;
  marketOddsAtBet: number;
  edge: number;
  confidence: number;
  betSize: number;
  reasoning: string;
  approved: boolean;
  outcome?: "WIN" | "LOSS" | "PENDING";
  pnl?: number;
  resolvedAt?: string;
  createdAt: string;
}
