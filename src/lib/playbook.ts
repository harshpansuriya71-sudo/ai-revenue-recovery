import { getDb } from "./db";
import { getBankHealth } from "./bank-health";
import { REASON_LABELS } from "./failures";

/**
 * The Recovery Playbook.
 *
 * The agent works one payment at a time. The pattern across payments is worth more than any
 * single case: a merchant losing ₹75,000 a month to one bank's UPI rail does not need better
 * retries, they need to stop routing through that rail.
 *
 * Every insight must carry a cost and a specific action. An observation without a rupee
 * figure attached is a chart, not advice.
 */

export interface Insight {
  id: string;
  severity: "high" | "medium" | "low";
  headline: string;
  detail: string;
  action: string;
  costPaise: number;
  recoverablePaise: number;
}

interface ReasonBankRow {
  error_reason: string;
  bank: string | null;
  method: string;
  n: number;
  amount_paise: number;
}

export function buildPlaybook(): Insight[] {
  const db = getDb();
  const insights: Insight[] = [];

  const total = db.prepare(`SELECT COALESCE(SUM(amount_paise),0) v FROM payments`).get() as {
    v: number;
  };
  if (!total.v) return insights;

  const rows = db
    .prepare(
      `SELECT error_reason, bank, method, COUNT(*) n, SUM(amount_paise) amount_paise
       FROM payments
       WHERE error_reason IS NOT NULL
       GROUP BY error_reason, bank, method`
    )
    .all() as unknown as ReasonBankRow[];

  /* --- 1. A single bank+rail combination bleeding money -------------------- */
  const infraRows = rows.filter((r) =>
    ["bank_down", "gateway_technical_error", "payment_timeout"].includes(r.error_reason)
  );
  const byBankRail = new Map<string, { bank: string; method: string; n: number; paise: number }>();
  for (const r of infraRows) {
    if (!r.bank) continue;
    const key = `${r.bank}|${r.method}`;
    const entry = byBankRail.get(key) ?? { bank: r.bank, method: r.method, n: 0, paise: 0 };
    entry.n += r.n;
    entry.paise += r.amount_paise;
    byBankRail.set(key, entry);
  }
  const worstRail = [...byBankRail.values()].sort((a, b) => b.paise - a.paise)[0];
  if (worstRail && worstRail.paise > 0) {
    const health = getBankHealth(worstRail.bank);
    const share = worstRail.paise / total.v;
    // Rail failures are the most recoverable class — the money is there, the pipe broke.
    const recoverable = Math.round(worstRail.paise * 0.7);
    insights.push({
      id: "worst-rail",
      severity: share > 0.15 ? "high" : "medium",
      headline: `${worstRail.bank} ${worstRail.method} is your most expensive failure point`,
      detail:
        `${worstRail.n} failures worth ${fmt(worstRail.paise)} came through ${worstRail.bank} ` +
        `${worstRail.method} — ${(share * 100).toFixed(0)}% of all failed value. ` +
        (health.status !== "healthy"
          ? `That issuer is currently ${health.status} at ${Math.round(health.successRate * 100)}% success.`
          : `The customer's money was available; only the rail failed.`),
      action:
        `Enable automatic fallback to a healthy method for ${worstRail.bank}, and route new ` +
        `${worstRail.method} attempts away while the issuer is degraded.`,
      costPaise: worstRail.paise,
      recoverablePaise: recoverable,
    });
  }

  /* --- 2. Card expiries, which are entirely preventable -------------------- */
  const expired = rows
    .filter((r) => r.error_reason === "card_expired")
    .reduce((acc, r) => ({ n: acc.n + r.n, paise: acc.paise + r.amount_paise }), { n: 0, paise: 0 });
  if (expired.n > 0) {
    insights.push({
      id: "card-expiry",
      severity: "medium",
      headline: "Card expiries are costing you money you could keep entirely",
      detail:
        `${expired.n} payments worth ${fmt(expired.paise)} failed because the saved card had ` +
        `expired. Every one of these was predictable — the expiry date was known in advance.`,
      action:
        "Prompt customers to update their card 30 days before expiry instead of discovering it " +
        "when the charge fails. Razorpay's card lifecycle webhooks can trigger this.",
      costPaise: expired.paise,
      recoverablePaise: Math.round(expired.paise * 0.85),
    });
  }

  /* --- 3. Good customers who were simply short at the wrong moment --------- */
  const shortfall = db
    .prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(p.amount_paise),0) paise
       FROM payments p JOIN customers c ON c.id = p.customer_id
       WHERE p.error_reason = 'insufficient_funds' AND c.prior_success_count >= 5`
    )
    .get() as { n: number; paise: number };
  if (shortfall.n > 0) {
    insights.push({
      id: "billing-date",
      severity: shortfall.paise > total.v * 0.1 ? "high" : "medium",
      headline: "You are billing loyal customers before they get paid",
      detail:
        `${shortfall.n} failures worth ${fmt(shortfall.paise)} were customers with five or more ` +
        `successful payments who simply had no balance that day. These are not churn risks — ` +
        `they are timing mismatches.`,
      action:
        "Move recurring charges for these customers to the 2nd-3rd of the month, after Indian " +
        "salary credit, and retry shortfalls on that cycle rather than every 24 hours.",
      costPaise: shortfall.paise,
      recoverablePaise: Math.round(shortfall.paise * 0.6),
    });
  }

  /* --- 4. Customers who cancelled — a retention problem, not a payments one */
  const revoked = rows
    .filter((r) => r.error_reason === "mandate_revoked")
    .reduce((acc, r) => ({ n: acc.n + r.n, paise: acc.paise + r.amount_paise }), { n: 0, paise: 0 });
  if (revoked.n > 0) {
    insights.push({
      id: "mandate-churn",
      severity: "low",
      headline: "Some of your failures are cancellations, not payment problems",
      detail:
        `${revoked.n} payments worth ${fmt(revoked.paise)} failed because the customer revoked ` +
        `their mandate. No retry strategy recovers these — they are a product and retention ` +
        `question, and chasing them damages the relationship further.`,
      action:
        "Route revoked mandates to your retention flow rather than your recovery flow, and ask " +
        "why they left before asking them to pay.",
      costPaise: revoked.paise,
      recoverablePaise: 0,
    });
  }

  /* --- 5. Which strategy is actually earning its place -------------------- */
  const byStrategy = db
    .prepare(
      `SELECT strategy,
              COUNT(*) n,
              SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) won,
              COALESCE(SUM(recovered_paise),0) recovered_paise
       FROM recovery_cases
       WHERE strategy IS NOT NULL
       GROUP BY strategy
       HAVING n >= 3`
    )
    .all() as unknown as Array<{
    strategy: string;
    n: number;
    won: number;
    recovered_paise: number;
  }>;

  const ranked = byStrategy
    .map((s) => ({ ...s, rate: s.n ? s.won / s.n : 0 }))
    .sort((a, b) => b.rate - a.rate);

  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.rate - worst.rate > 0.2) {
      insights.push({
        id: "strategy-lift",
        severity: "low",
        headline: `${label(best.strategy)} is converting far better than ${label(worst.strategy)}`,
        detail:
          `${label(best.strategy)} recovered ${(best.rate * 100).toFixed(0)}% of the cases it was ` +
          `used on (${best.won}/${best.n}), against ${(worst.rate * 100).toFixed(0)}% for ` +
          `${label(worst.strategy)} (${worst.won}/${worst.n}).`,
        action:
          `Feed these observed rates back into the agent's context so it prefers ` +
          `${label(best.strategy)} where both strategies are viable.`,
        costPaise: 0,
        recoverablePaise: 0,
      });
    }
  }

  return insights.sort((a, b) => b.recoverablePaise - a.recoverablePaise);
}

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function label(strategy: string) {
  return REASON_LABELS[strategy] ?? strategy.toLowerCase().replace(/_/g, " ");
}
