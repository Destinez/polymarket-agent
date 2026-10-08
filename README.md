# polymarket-agent

A TypeScript CLI agent that scans [Polymarket](https://polymarket.com) prediction markets, researches each one with recent news, asks Claude for a probability estimate, and proposes **paper trades** sized with a half-Kelly rule — every trade needs your approval in the terminal before it is recorded.

> Paper trading only. Real order execution is not implemented; the agent refuses to run trades unless `PAPER_TRADING=true`.

## How it works

Each cycle (on start, then every 2 hours via `node-cron`):

1. **Markets** (`src/polymarket.ts`) — fetches markets from the Polymarket CLOB API (`@polymarket/clob-client`, read-only) and keeps up to 20 in the `crypto`, `politics` or `sports` categories with ≥ $10k volume that end more than 24 h from now.
2. **News** (`src/news.ts`) — searches Tavily for news on each market (last 7 days, keeping up to 5 articles from the last 48 h). Markets with fewer than 3 articles are skipped.
3. **Analysis** (`src/analyzer.ts`) — sends the market and news to Claude (`claude-3-5-haiku`) and gets back JSON: probability of YES, confidence (0–100), direction (`YES`/`NO`/`SKIP`) and reasoning. Edge = AI probability − market price.
4. **Filter** — only proceeds when confidence ≥ `MIN_CONFIDENCE` and |edge| ≥ `MIN_EDGE`.
5. **Sizing** (`src/kelly.ts`) — half-Kelly on the current bankroll (`STARTING_BANKROLL` + logged P&L), capped at `MAX_BET_PERCENT` of bankroll, minimum $1.
6. **Human approval** (`src/approval.ts`) — prints the opportunity and asks you to approve, reject, or view the news sources first (`inquirer`).
7. **Logging** (`src/logger.ts`) — writes the prediction to a Supabase `prediction_logs` table (skipped if Supabase isn't configured) and records the paper trade.

A **weekly review** runs every Sunday at 09:00 (server time): it collects stats from Supabase (win rate, P&L, results by category and by confidence band) and asks Claude to suggest threshold adjustments.

## Stack

- TypeScript (ESM), Node.js, `tsx`
- Anthropic Claude (`@anthropic-ai/sdk`)
- Tavily search (`@tavily/core`)
- Polymarket CLOB client (`@polymarket/clob-client`)
- Supabase (`@supabase/supabase-js`)
- `node-cron`, `inquirer`, `dotenv`

## Setup

```bash
git clone https://github.com/Destinez/polymarket-agent.git
cd polymarket-agent
npm ci
cp .env.example .env   # then fill in the values
```

Optional — create the Supabase table (the schema is also in `src/logger.ts`):

```sql
CREATE TABLE prediction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id TEXT NOT NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL,
  predicted_direction TEXT NOT NULL,
  ai_probability FLOAT NOT NULL,
  market_odds_at_bet FLOAT NOT NULL,
  edge FLOAT NOT NULL,
  confidence FLOAT NOT NULL,
  bet_size FLOAT NOT NULL,
  reasoning TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  outcome TEXT DEFAULT 'PENDING',
  pnl FLOAT DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Claude market analysis and weekly review |
| `TAVILY_API_KEY` | yes | — | News search |
| `POLYMARKET_API_KEY` | yes* | — | Market fetching is disabled when unset (the client itself reads public CLOB data) |
| `PAPER_TRADING` | yes | — | Must be `true`; real trading is not implemented |
| `SUPABASE_URL` | no | — | Prediction log; logging is disabled when unset |
| `SUPABASE_ANON_KEY` | no | — | Prediction log |
| `STARTING_BANKROLL` | no | `500` | Paper bankroll in USD |
| `MIN_CONFIDENCE` | no | `70` | Minimum Claude confidence (0–100) |
| `MIN_EDGE` | no | `15` | Minimum edge, in percentage points |
| `MAX_BET_PERCENT` | no | `5` | Max bet as % of bankroll |

## Usage

```bash
npm run start    # run one cycle now, then every 2 h + weekly review (Sundays 09:00)
npm run review   # run the weekly performance review once
npm run stats    # print the performance report
npm run dev      # start with nodemon
npm run build    # type-check and compile to dist/
```

## Status and limitations

- Experimental and paper trading only — nothing here places real orders.
- Market resolution tracking is not finished: resolved markets are detected and logged, but outcomes aren't yet matched back to predictions, so win rate and P&L stay at zero until that's built.
- The Supabase schema uses snake_case columns while the logger writes camelCase fields; align them before relying on Supabase logging.
- Not financial advice.

## License

[MIT](./LICENSE) © 2026 Obaro Destiny Udurie
