/**
 * Resolves worked cases into outcomes and prints the comparison against a blind
 * fixed-schedule retry — the number the whole pitch rests on.
 *
 * Outcomes are simulated. See src/lib/outcomes.ts.
 *
 * Run: npm run settle
 */
import { getDb } from "../src/lib/db";
import { settleOutcomes, baselineComparison } from "../src/lib/outcomes";
import { stats } from "../src/lib/queries";
import { rupees, percent } from "../src/lib/format";

function main() {
  getDb();
  const result = settleOutcomes();
  const base = baselineComparison();
  const s = stats();

  console.log(`\n  Settled ${result.settled} cases this run (${result.recovered} recovered).\n`);
  console.log(`  Cases worked by the agent   ${base.workedCount}`);
  console.log(`  Value of those cases        ${rupees(base.workedPaise)}\n`);
  console.log(
    `  Recovered by Rebound        ${rupees(base.reboundPaise).padStart(10)}   ${percent(base.reboundRate)}`
  );
  console.log(
    `  A fixed 24h retry would     ${rupees(base.baselinePaise).padStart(10)}   ${percent(base.baselineRate)}`
  );
  console.log(`  ${"-".repeat(52)}`);
  console.log(`  Difference                  ${rupees(base.deltaPaise).padStart(10)}\n`);
  console.log(
    `  Still unworked: ${rupees(s.atRiskPaise)} across ${s.failedCount} payments.`
  );
  console.log("  (Outcomes are simulated — see src/lib/outcomes.ts)\n");
}

main();
