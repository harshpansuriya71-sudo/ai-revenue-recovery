/**
 * Agent evaluation suite.
 *
 * The pitch makes specific claims — that the agent never retries a dead instrument, that it
 * checks issuer health before timing an infrastructure retry, that it respects a cancelled
 * mandate. Those are testable, and until they are tested they are only hopes.
 *
 * This matters because the reasoning has silently regressed twice already: first the model
 * defaulted to a blind 24-hour retry, then it defaulted to sending a payment link for
 * everything. Both looked fine in a spot check. A prompt edit can undo any of it.
 *
 * Run: npm run eval
 */
import { getDb } from "../src/lib/db";
import { runAgentOnPayment } from "../src/lib/agent/run";
import { getActions, getCase, upsertCustomer, upsertPayment, createCase } from "../src/lib/queries";
import { signatureFor } from "../src/lib/failures";
import { getBankHealth } from "../src/lib/bank-health";

interface Check {
  name: string;
  /** Returns null when the invariant holds, or a failure message when it does not. */
  assert: (ctx: EvalContext) => string | null;
}

interface EvalContext {
  strategy: string;
  toolsCalled: string[];
  retryAt: string | null;
  retryMethod: string | null;
  retryScheduled: boolean;
  paymentLink: string | null;
  bank: string | null;
  caseStatus: string;
}

interface Fixture {
  id: string;
  label: string;
  reason: string;
  method: string;
  bank: string | null;
  amountPaise: number;
  priorSuccesses: number;
  checks: Check[];
}

/* ------------------------------------------------------------------ checks */

const neverRetries: Check = {
  name: "never schedules a retry",
  assert: (c) =>
    c.retryScheduled
      ? `scheduled a retry (${c.retryAt}) on an instrument that cannot succeed`
      : null,
};

const mustCloseTheCase: Check = {
  name: "closes the case",
  assert: (c) =>
    c.retryScheduled || c.paymentLink || c.caseStatus === "uncollectible"
      ? null
      : "took no closing action — no retry, no payment link, no write-off",
};

const retryInFuture: Check = {
  name: "any retry is in the future",
  assert: (c) => {
    if (!c.retryAt) return null;
    const t = new Date(c.retryAt).getTime();
    if (Number.isNaN(t)) return `retry_at is not a valid timestamp: ${c.retryAt}`;
    return t > Date.now() ? null : `retry_at ${c.retryAt} is in the past`;
  },
};

const checksBankHealth: Check = {
  name: "checks issuer health before deciding",
  assert: (c) =>
    c.toolsCalled.includes("check_bank_health")
      ? null
      : "never called check_bank_health on an infrastructure failure",
};

const retryAfterOutageClears: Check = {
  name: "does not retry into a known outage",
  assert: (c) => {
    if (!c.retryAt || !c.bank) return null;
    const health = getBankHealth(c.bank);
    if (health.status === "healthy" || health.estimatedRecoveryMinutes == null) return null;

    // Routing around the outage is a valid answer — an issuer is usually degraded on one
    // rail, not all of them. Only a retry on the *affected* rail has to wait it out.
    const affected = health.affectedMethods.includes(c.retryMethod ?? "");
    if (!affected) return null;

    const clearsAt = Date.now() + health.estimatedRecoveryMinutes * 60000;
    return new Date(c.retryAt).getTime() >= clearsAt - 5 * 60000
      ? null
      : `retry on ${c.retryMethod} at ${c.retryAt} lands before ${c.bank} ${c.retryMethod} recovers (~${health.estimatedRecoveryMinutes}m)`;
  },
};

function mustChoose(...allowed: string[]): Check {
  return {
    name: `chooses ${allowed.join(" or ")}`,
    assert: (c) =>
      allowed.includes(c.strategy) ? null : `chose ${c.strategy}`,
  };
}

function mustNotChoose(...banned: string[]): Check {
  return {
    name: `does not choose ${banned.join(" or ")}`,
    assert: (c) => (banned.includes(c.strategy) ? `chose ${c.strategy}` : null),
  };
}

/* ---------------------------------------------------------------- fixtures */

const FIXTURES: Fixture[] = [
  {
    id: "eval_card_expired",
    label: "Expired card — must never be retried",
    reason: "card_expired",
    method: "card",
    bank: "AXIS",
    amountPaise: 199900,
    priorSuccesses: 12,
    checks: [neverRetries, mustCloseTheCase, mustChoose("REQUEST_NEW_INSTRUMENT", "PAYMENT_LINK_NUDGE")],
  },
  {
    id: "eval_invalid_vpa",
    label: "Dead UPI ID — must never be retried",
    reason: "invalid_vpa",
    method: "upi",
    bank: "SBI",
    amountPaise: 49900,
    priorSuccesses: 3,
    checks: [neverRetries, mustCloseTheCase, mustNotChoose("RETRY_SAME", "RETRY_ALTERNATE_METHOD")],
  },
  {
    id: "eval_mandate_revoked",
    label: "Cancelled mandate — must stop, not chase",
    reason: "mandate_revoked",
    method: "upi",
    bank: "ICICI",
    amountPaise: 99900,
    priorSuccesses: 8,
    checks: [neverRetries, mustChoose("MARK_UNCOLLECTIBLE")],
  },
  {
    id: "eval_bank_down",
    label: "Bank outage — must check health and wait it out",
    reason: "bank_down",
    method: "netbanking",
    bank: "KOTAK",
    amountPaise: 499900,
    priorSuccesses: 15,
    checks: [checksBankHealth, retryInFuture, retryAfterOutageClears, mustCloseTheCase],
  },
  {
    id: "eval_insufficient_strong",
    label: "Short on funds, loyal customer — must not write them off",
    reason: "insufficient_funds",
    method: "upi",
    bank: "HDFC",
    amountPaise: 199900,
    priorSuccesses: 22,
    checks: [mustNotChoose("MARK_UNCOLLECTIBLE"), retryInFuture, mustCloseTheCase],
  },
  {
    id: "eval_gateway_error",
    label: "Gateway blip — transient, should not blame the customer",
    reason: "gateway_technical_error",
    method: "card",
    bank: "ICICI",
    amountPaise: 89900,
    priorSuccesses: 6,
    checks: [mustNotChoose("MARK_UNCOLLECTIBLE", "REQUEST_NEW_INSTRUMENT"), retryInFuture, mustCloseTheCase],
  },
];

/* ------------------------------------------------------------------- runner */

function seedFixture(f: Fixture) {
  const sig = signatureFor(f.reason)!;
  const customerId = `${f.id}_cust`;
  upsertCustomer({
    id: customerId,
    name: "Eval Customer",
    email: "eval@example.com",
    phone: "+919800000000",
    prior_success_count: f.priorSuccesses,
    prior_failure_count: 1,
    lifetime_value_paise: f.priorSuccesses * 150000,
    created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
  });
  upsertPayment({
    id: f.id,
    order_id: `${f.id}_order`,
    customer_id: customerId,
    amount_paise: f.amountPaise,
    currency: "INR",
    method: f.method,
    bank: f.bank,
    description: "Growth plan — monthly",
    is_recurring: 1,
    status: "failed",
    error_code: sig.code,
    error_reason: sig.reason,
    error_source: sig.source,
    error_step: sig.step,
    error_description: sig.description,
    failed_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 3604000).toISOString(),
  });
  createCase(f.id);
}

function clearFixtures() {
  const db = getDb();
  for (const f of FIXTURES) {
    db.prepare(
      `DELETE FROM agent_actions WHERE case_id IN (SELECT id FROM recovery_cases WHERE payment_id = ?)`
    ).run(f.id);
    db.prepare(`DELETE FROM recovery_cases WHERE payment_id = ?`).run(f.id);
    db.prepare(`DELETE FROM payments WHERE id = ?`).run(f.id);
    db.prepare(`DELETE FROM customers WHERE id = ?`).run(`${f.id}_cust`);
  }
}

async function main() {
  getDb();
  clearFixtures();

  console.log("\n  Agent evaluation — asserting decisions, not just outputs\n");

  let failures = 0;
  let checksRun = 0;

  let first = true;
  for (const f of FIXTURES) {
    // Space the fixtures out: the free tier caps requests per minute and each fixture costs
    // several calls, so a tight loop fails most of the suite for reasons unrelated to the agent.
    if (!first) await new Promise((r) => setTimeout(r, 20000));
    first = false;

    seedFixture(f);

    let decision;
    try {
      decision = await runAgentOnPayment(f.id);
    } catch (err) {
      failures++;
      console.log(`  ✗ ${f.label}`);
      console.log(`      agent threw: ${(err as Error).message.slice(0, 120)}\n`);
      continue;
    }

    const kase = getCase(decision.caseId)!;
    const actions = getActions(decision.caseId);
    const toolsCalled = actions.filter((a) => a.kind === "tool_call").map((a) => a.tool_name ?? "");

    // A retry only counts as scheduled if the tool actually accepted it — the tool rejects
    // past timestamps, and a rejected call must not read as a scheduled retry.
    const retryScheduled = actions.some((a) => {
      if (a.tool_name !== "schedule_retry" || !a.tool_result) return false;
      try {
        return JSON.parse(a.tool_result).scheduled === true;
      } catch {
        return false;
      }
    });

    const ctx: EvalContext = {
      strategy: decision.strategy,
      toolsCalled,
      retryAt: kase.retry_at,
      retryMethod: kase.retry_method,
      retryScheduled,
      paymentLink: kase.payment_link_url,
      bank: f.bank,
      caseStatus: kase.status,
    };

    const failed: string[] = [];
    for (const check of f.checks) {
      checksRun++;
      const problem = check.assert(ctx);
      if (problem) failed.push(`${check.name} — ${problem}`);
    }

    if (failed.length) {
      failures += failed.length;
      console.log(`  ✗ ${f.label}`);
      console.log(`      strategy: ${decision.strategy}   tools: ${toolsCalled.join(", ")}`);
      for (const msg of failed) console.log(`      ✗ ${msg}`);
      console.log("");
    } else {
      console.log(`  ✓ ${f.label}`);
      console.log(`      ${decision.strategy}  (${f.checks.length} checks passed)\n`);
    }
  }

  clearFixtures();

  console.log(`  ${"-".repeat(58)}`);
  if (failures === 0) {
    console.log(`  All ${checksRun} checks passed across ${FIXTURES.length} fixtures.\n`);
    process.exit(0);
  } else {
    console.log(`  ${failures} of ${checksRun} checks FAILED across ${FIXTURES.length} fixtures.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
