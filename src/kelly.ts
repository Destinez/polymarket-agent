import { getStats } from "./logger.js";

export async function calculateBetSize(bankroll: number, aiProb: number, marketOdds: number): Promise<number> {
  // Half-Kelly criterion formula
  const b = (1 - marketOdds) / marketOdds; // Decimal odds minus 1
  const kelly = (aiProb * b - (1 - aiProb)) / b;
  const halfKelly = kelly * 0.5;

  const maxBetPercent = parseFloat(process.env.MAX_BET_PERCENT || "5") / 100;
  const maxBetSize = bankroll * maxBetPercent;

  let betSize = bankroll * halfKelly;

  // Cap at max percentage
  betSize = Math.min(betSize, maxBetSize);

  // Never bet less than $1
  betSize = Math.max(betSize, 1);

  // Round to 2 decimal places
  return Math.round(betSize * 100) / 100;
}

export async function getCurrentBankroll(): Promise<number> {
  const startingBankroll = parseFloat(process.env.STARTING_BANKROLL || "500");

  try {
    const stats = await getStats();
    const totalPnL = (stats as any).totalPnL || 0;
    return startingBankroll + totalPnL;
  } catch (error) {
    console.warn("Could not fetch current PnL, using starting bankroll:", error);
    return startingBankroll;
  }
}
