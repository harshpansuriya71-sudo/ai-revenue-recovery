/**
 * Works a batch of pending cases so the dashboard has a real dataset.
 *
 * Concurrency is deliberately low: the free-tier model has a per-minute request cap and each
 * case costs several calls, so a wide fan-out trips the limit and fails half the batch.
 *
 * Run: npm run work -- 15
 */
import { getDb } from "../src/lib/db";
import { runAgentOnPayment } from "../src/lib/agent/run";

const COUNT = Number(process.argv[2] ?? 12);
const CONCURRENCY = 2;

function pending(limit: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT c.payment_id FROM recovery_cases c
         JOIN payments p ON p.id = c.payment_id
         WHERE c.strategy IS NULL
         ORDER BY p.amount_paise DESC
         LIMIT ?`
      )
      .all(limit) as Array<{ payment_id: string }>
  ).map((r) => r.payment_id);
}

async function main() {
  const ids = pending(COUNT);
  console.log(`Working ${ids.length} cases at concurrency ${CONCURRENCY}...\n`);

  let done = 0;
  let failed = 0;
  const queue = [...ids];

  async function worker(n: number) {
    while (queue.length) {
      const id = queue.shift();
      if (!id) return;
      try {
        const d = await runAgentOnPayment(id);
        done++;
        console.log(`  [w${n}] ${id}  ->  ${d.strategy}  (${done}/${ids.length})`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  [w${n}] ${id}  ->  FAILED: ${msg.slice(0, 120)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  console.log(`\nDone. ${done} worked, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
