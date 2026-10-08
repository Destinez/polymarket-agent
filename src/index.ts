import "dotenv/config";
import cron from "node-cron";
import { runAgentCycle } from "./agent.js";
import { runWeeklyReview, printPerformanceReport } from "./reviewer.js";

const AGENT_CRON = "0 */2 * * *";
const REVIEW_CRON = "0 9 * * 0";

function handleShutdown(signal: string): void {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  process.exit(0);
}

async function startAgentLoop(): Promise<void> {
  console.log("🤖 Starting polymarket-agent...");

  await runAgentCycle();

  cron.schedule(AGENT_CRON, async () => {
    console.log("\n🤖 Scheduled agent cycle triggered.");
    await runAgentCycle();
  });

  cron.schedule(REVIEW_CRON, async () => {
    console.log("\n📊 Scheduled weekly review triggered.");
    await runWeeklyReview();
  });

  console.log("✅ Scheduler started.");
  console.log("Press CTRL+C to stop.");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";

  try {
    switch (command) {
      case "start":
        await startAgentLoop();
        break;
      case "review":
        await runWeeklyReview();
        break;
      case "stats":
        await printPerformanceReport();
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log("Usage: npm run start | npm run review | npm run stats");
        process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error in index.ts:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

main();
