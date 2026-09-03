/**
 * Runs the agent on two payments with deliberately different root causes and prints
 * what it decided. The whole premise of the project is that these two produce different
 * strategies — if they ever converge, the prompt has regressed.
 *
 * Run: npm run try-agent
 */
import { getDb } from "../src/lib/db";
import { runAgentOnPayment } from "../src/lib/agent/run";
import { getActions, getCase } from "../src/lib/queries";
import { rupees } from "../src/lib/format";

function pickPayment(reason: string) {
  return getDb()
    .prepare(
      `SELECT p.id, p.amount_paise, p.method, p.bank, p.error_reason
       FROM payments p JOIN recovery_cases c ON c.payment_id = p.id
       WHERE p.error_reason = ? AND c.strategy IS NULL
       LIMIT 1`
    )
    .get(reason) as
    | { id: string; amount_paise: number; method: string; bank: string; error_reason: string }
    | undefined;
}

async function work(reason: string) {
  const p = pickPayment(reason);
  if (!p) {
    console.log(`\n(no unworked payment with reason "${reason}")`);
    return;
  }

  console.log(`\n${"=".repeat(74)}`);
  console.log(`CASE: ${reason}  ·  ${rupees(p.amount_paise)}  ·  ${p.method}${p.bank ? " / " + p.bank : ""}`);
  console.log("=".repeat(74));

  const t0 = Date.now();
  const decision = await runAgentOnPayment(p.id);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  for (const a of getActions(decision.caseId)) {
    if (a.kind === "tool_call") {
      const result = a.tool_result ? JSON.parse(a.tool_result) : {};
      const summary =
        result.guidance ?? result.note ?? result.payment_link_url ?? result.reason ?? "";
      console.log(`  → ${a.tool_name}(${(a.tool_input ?? "").slice(0, 90)})`);
      if (summary) console.log(`      ${String(summary).slice(0, 150)}`);
    } else if (a.kind === "thinking" && a.text) {
      console.log(`  · ${a.text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }

  const kase = getCase(decision.caseId);
  console.log(`\n  DIAGNOSIS  ${decision.diagnosis}`);
  console.log(`  STRATEGY   ${decision.strategy}   (confidence ${decision.confidence})`);
  console.log(`  REASONING  ${decision.reasoning}`);
  if (kase?.retry_at) console.log(`  RETRY AT   ${kase.retry_at} via ${kase.retry_method}`);
  if (kase?.payment_link_url) console.log(`  LINK       ${kase.payment_link_url}`);
  if (kase?.nudge_message) {
    console.log(`  NUDGE (${kase.nudge_channel}):`);
    console.log(
      kase.nudge_message.split("\n").map((l) => "      " + l).join("\n")
    );
  }
  console.log(`\n  (${secs}s)`);
}

async function main() {
  // A permanent instrument failure and a transient infrastructure failure.
  await work("card_expired");
  await work("bank_down");
  console.log("");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
