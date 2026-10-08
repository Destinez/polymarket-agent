import inquirer from "inquirer";
import type { Analysis } from "./types.js";

export async function presentBetForApproval(analysis: Analysis, betSize: number): Promise<boolean> {
  console.log(`
══════════════════════════════════════
🎯 BET OPPORTUNITY FOUND
══════════════════════════════════════
Market:     ${analysis.question}
Category:   ${analysis.category || "Unknown"}
Direction:  ${analysis.direction}
──────────────────────────────────────
Market odds:  ${(analysis.currentYesOdds * 100).toFixed(1)}%
AI estimate:  ${(analysis.aiProbability * 100).toFixed(1)}%
Edge:         ${(analysis.edge * 100).toFixed(1)}%
Confidence:   ${analysis.confidence.toFixed(1)}%
──────────────────────────────────────
Reasoning:
${analysis.reasoning}
──────────────────────────────────────
News sources used: ${analysis.newsUsed.length} articles
Recommended bet:   $${betSize.toFixed(2)} (paper)
══════════════════════════════════════
  `);

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Approve this paper trade?",
      choices: [
        { name: "✅ Yes, approve the trade", value: "approve" },
        { name: "❌ No, skip this opportunity", value: "reject" },
        { name: "📄 Show news details", value: "details" },
      ],
    },
  ]);

  if (action === "details") {
    console.log("\n📰 NEWS ARTICLES USED:");
    analysis.newsUsed.forEach((article, i) => {
      console.log(`\n${i + 1}. ${article.title}`);
      console.log(`   Source: ${article.source}`);
      console.log(`   Date: ${new Date(article.publishedAt).toLocaleDateString()}`);
      console.log(`   URL: ${article.url}`);
      console.log(`   Content: ${article.content.substring(0, 200)}...`);
    });

    const { finalDecision } = await inquirer.prompt([
      {
        type: "confirm",
        name: "finalDecision",
        message: "After reviewing the news, do you want to approve this trade?",
        default: false,
      },
    ]);

    return finalDecision;
  }

  return action === "approve";
}
