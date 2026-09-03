import { getDb } from "./db";
import { setPaymentStatus, updateCase } from "./queries";
import { signatureFor, type Strategy } from "./failures";

/**
 * Resolves worked cases into outcomes, and computes what a blind fixed-schedule retry would
 * have achieved on the same cases.
 *
 * IMPORTANT — these outcomes are SIMULATED. In a real deployment the outcome arrives as a
 * `payment.captured` webhook when the retry or payment link actually succeeds. Nothing here
 * observes a real payment; it models what would plausibly happen so the dashboard can show a
 * recovery rate at all.
 *
 * The model is the project thesis made measurable: a strategy succeeds in proportion to how
 * well it addresses the ACTUAL root cause. Retrying an expired card fails no matter how
 * confident the agent was.
 */

/** Base success rate per strategy, before cause-fit and customer-history adjustment. */
const BASE_SUCCESS: Record<Strategy, number> = {
  RETRY_SAME: 0.72, // the money was there; only the rail was broken
  RETRY_ALTERNATE_METHOD: 0.66, // routes around a degraded rail
  WAIT_FOR_SALARY_CYCLE: 0.58, // intent present, funds arrive later
  PAYMENT_LINK_NUDGE: 0.47, // needs the customer to act
  REQUEST_NEW_INSTRUMENT: 0.36, // needs the customer to add a new instrument
  MARK_UNCOLLECTIBLE: 0, // correctly abandoned
};

const PERMANENTLY_DEAD = ["card_expired", "invalid_vpa", "mandate_revoked"];

/**
 * Strategies that are simply wrong for a given cause. Choosing one collapses the success
 * rate regardless of the base rate — this is what stops a confident-but-wrong agent from
 * scoring well, and it is why the agent can legitimately lose to the baseline on a case it
 * got wrong.
 */
function causeFit(strategy: string, reason: string | null): number {
  if (!reason) return 1;
  const sig = signatureFor(reason);
  if (!sig) return 1;

  // Retrying a permanently dead instrument cannot succeed.
  if (
    PERMANENTLY_DEAD.includes(reason) &&
    (strategy === "RETRY_SAME" || strategy === "RETRY_ALTERNATE_METHOD")
  ) {
    return 0.02;
  }

  // Nudging a customer about a failure that was purely the bank's fault converts poorly —
  // there is nothing for them to fix.
  if (sig.source === "bank" && strategy === "PAYMENT_LINK_NUDGE") return 0.6;

  // Asking for a brand-new instrument when the existing one is fine is heavy-handed.
  if (sig.source === "bank" && strategy === "REQUEST_NEW_INSTRUMENT") return 0.4;

  return 1;
}

function reboundProbability(
  strategy: string,
  reason: string | null,
  priorSuccessCount: number
): number {
  const base = BASE_SUCCESS[strategy as Strategy] ?? 0.3;
  // A customer with a long clean record is more likely to come good.
  const historyBoost = Math.min(priorSuccessCount, 20) * 0.006;
  return Math.min(base * causeFit(strategy, reason) + historyBoost, 0.95);
}

/**
 * What a blind fixed-schedule retry (+24h, same method, every time) achieves.
 * It only ever works when the cause happens to clear on its own within the window, and it
 * can never work on a permanently dead instrument.
 */
function baselineProbability(reason: string | null): number {
  if (!reason) return 0.12;
  if (PERMANENTLY_DEAD.includes(reason)) return 0;
  const sig = signatureFor(reason);
  if (!sig) return 0.12;
  return sig.selfResolving ? 0.22 : 0.04;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-case randomness, so re-running settlement never changes a decided outcome. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface WorkedRow {
  id: string;
  strategy: string;
  payment_id: string;
  amount_paise: number;
  error_reason: string | null;
  prior_success_count: number;
}

function workedCases(onlyUnsettled: boolean): WorkedRow[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.strategy, p.id AS payment_id, p.amount_paise, p.error_reason,
              cu.prior_success_count
       FROM recovery_cases c
       JOIN payments p   ON p.id = c.payment_id
       JOIN customers cu ON cu.id = p.customer_id
       WHERE c.strategy IS NOT NULL
         -- A case still awaiting merchant approval has not acted, so it cannot have an
         -- outcome. Settling it would credit the agent with a recovery it never attempted.
         AND (c.approval_status IS NULL OR c.approval_status != 'pending')
       ${onlyUnsettled ? "AND c.status NOT IN ('recovered', 'uncollectible')" : ""}`
    )
    .all() as unknown as WorkedRow[];
}

/**
 * One random draw per case decides BOTH outcomes.
 *
 * This matters. With independent draws the baseline can beat the agent by luck alone, which
 * makes the comparison meaningless. Sharing the draw means the baseline wins a case only
 * when its probability genuinely exceeds the agent's — i.e. only when the agent chose badly.
 */
function outcomeFor(row: WorkedRow) {
  const draw = mulberry32(hashSeed(row.id))();
  const pRebound = reboundProbability(row.strategy, row.error_reason, row.prior_success_count);
  const pBaseline = baselineProbability(row.error_reason);
  return {
    reboundRecovered: draw < pRebound,
    baselineRecovered: draw < pBaseline,
  };
}

export interface SettleResult {
  settled: number;
  recovered: number;
  recoveredPaise: number;
}

/**
 * Settles every case the agent has worked but that has no outcome yet.
 * Idempotent: outcomes derive from a per-case seed, so re-running is stable.
 */
export function settleOutcomes(): SettleResult {
  const rows = workedCases(true);
  let recovered = 0;
  let recoveredPaise = 0;

  for (const row of rows) {
    const { reboundRecovered } = outcomeFor(row);
    if (reboundRecovered) {
      recovered += 1;
      recoveredPaise += row.amount_paise;
      updateCase(row.id, {
        status: "recovered",
        recovered_paise: row.amount_paise,
        resolved_at: new Date().toISOString(),
      });
      setPaymentStatus(row.payment_id, "recovered");
    } else {
      updateCase(row.id, {
        status: "uncollectible",
        resolved_at: new Date().toISOString(),
      });
    }
  }

  return { settled: rows.length, recovered, recoveredPaise };
}

/**
 * Rebound versus the fixed-retry baseline, over exactly the same set of worked cases.
 *
 * Scoping both to worked cases is the point: comparing the agent's recovery against a
 * denominator that includes cases it never touched would flatter the baseline and make the
 * numbers meaningless.
 */
export function baselineComparison() {
  const rows = workedCases(false);

  let workedPaise = 0;
  let reboundPaise = 0;
  let baselinePaise = 0;

  for (const row of rows) {
    workedPaise += row.amount_paise;
    const { reboundRecovered, baselineRecovered } = outcomeFor(row);
    if (reboundRecovered) reboundPaise += row.amount_paise;
    if (baselineRecovered) baselinePaise += row.amount_paise;
  }

  return {
    workedCount: rows.length,
    workedPaise,
    reboundPaise,
    baselinePaise,
    reboundRate: workedPaise > 0 ? reboundPaise / workedPaise : 0,
    baselineRate: workedPaise > 0 ? baselinePaise / workedPaise : 0,
    deltaPaise: reboundPaise - baselinePaise,
  };
}
