/**
 * Seeds the database with a reproducible set of failed payments.
 *
 * Run: npm run seed
 */
import { getDb, resetDb } from "../src/lib/db";
import { generateDataset } from "../src/lib/simulator";
import { upsertCustomer, upsertPayment, createCase, stats } from "../src/lib/queries";
import { REASON_LABELS } from "../src/lib/failures";

const COUNT = Number(process.argv[2] ?? 60);

function rupees(paise: number) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function main() {
  getDb();
  resetDb();

  const { customers, payments } = generateDataset(COUNT);

  for (const c of customers) upsertCustomer(c);
  for (const p of payments) {
    upsertPayment(p);
    // Every failed payment opens a case. The agent works them one at a time.
    createCase(p.id);
  }

  const s = stats();
  console.log(`\n  Seeded ${customers.length} customers and ${payments.length} failed payments.`);
  console.log(`  Revenue at risk: ${rupees(s.atRiskPaise)} across ${s.failedCount} payments\n`);
  console.log("  Failure breakdown:");
  for (const r of s.byReason) {
    const label = (REASON_LABELS[r.reason] ?? r.reason).padEnd(22);
    console.log(`    ${label} ${String(r.count).padStart(3)}  ${rupees(r.amount_paise)}`);
  }
  console.log("\n  Next: npm run dev\n");
}

main();
