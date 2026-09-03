import { getDb } from "./db";
import { randomUUID } from "node:crypto";

/** All SQL lives here so the routes and the agent tools stay readable. */

export interface PaymentRow {
  id: string;
  order_id: string;
  customer_id: string;
  amount_paise: number;
  currency: string;
  method: string;
  bank: string | null;
  description: string;
  is_recurring: number;
  status: string;
  error_code: string | null;
  error_reason: string | null;
  error_source: string | null;
  error_step: string | null;
  error_description: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  prior_success_count: number;
  prior_failure_count: number;
  lifetime_value_paise: number;
  created_at: string;
}

export interface CaseRow {
  id: string;
  payment_id: string;
  status: string;
  strategy: string | null;
  diagnosis: string | null;
  reasoning: string | null;
  confidence: number | null;
  retry_at: string | null;
  retry_method: string | null;
  payment_link_url: string | null;
  payment_link_id: string | null;
  nudge_channel: string | null;
  nudge_message: string | null;
  recovered_paise: number;
  created_at: string;
  resolved_at: string | null;
}

export interface ActionRow {
  id: number;
  case_id: string;
  seq: number;
  kind: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_result: string | null;
  text: string | null;
  created_at: string;
}

/* ---------------------------------------------------------------- customers */

export function upsertCustomer(c: CustomerRow) {
  getDb()
    .prepare(
      `INSERT INTO customers (id, name, email, phone, prior_success_count,
                              prior_failure_count, lifetime_value_paise, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         phone = excluded.phone,
         prior_success_count = excluded.prior_success_count,
         prior_failure_count = excluded.prior_failure_count,
         lifetime_value_paise = excluded.lifetime_value_paise`
    )
    .run(
      c.id, c.name, c.email, c.phone,
      c.prior_success_count, c.prior_failure_count, c.lifetime_value_paise, c.created_at
    );
}

export function getCustomer(id: string): CustomerRow | undefined {
  return getDb().prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as CustomerRow | undefined;
}

/* ----------------------------------------------------------------- payments */

export function upsertPayment(p: PaymentRow) {
  getDb()
    .prepare(
      `INSERT INTO payments (id, order_id, customer_id, amount_paise, currency, method, bank,
                             description, is_recurring, status, error_code, error_reason,
                             error_source, error_step, error_description, failed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status`
    )
    .run(
      p.id, p.order_id, p.customer_id, p.amount_paise, p.currency, p.method, p.bank,
      p.description, p.is_recurring, p.status, p.error_code, p.error_reason,
      p.error_source, p.error_step, p.error_description, p.failed_at, p.created_at
    );
}

export function getPayment(id: string): PaymentRow | undefined {
  return getDb().prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as PaymentRow | undefined;
}

export function setPaymentStatus(id: string, status: string) {
  getDb().prepare(`UPDATE payments SET status = ? WHERE id = ?`).run(status, id);
}

/** Prior failed payments for the same customer — the agent uses this to spot repeat trouble. */
export function customerFailureHistory(customerId: string, excludePaymentId: string) {
  return getDb()
    .prepare(
      `SELECT id, amount_paise, method, error_reason, failed_at, status
       FROM payments
       WHERE customer_id = ? AND id != ?
       ORDER BY failed_at DESC LIMIT 10`
    )
    .all(customerId, excludePaymentId) as Array<Record<string, unknown>>;
}

/* -------------------------------------------------------------------- cases */

export function createCase(paymentId: string): CaseRow {
  const row = {
    id: `case_${randomUUID().slice(0, 12)}`,
    payment_id: paymentId,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO recovery_cases (id, payment_id, status, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(row.id, row.payment_id, row.status, row.created_at);
  return getCase(row.id)!;
}

export function getCase(id: string): CaseRow | undefined {
  return getDb().prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(id) as CaseRow | undefined;
}

export function getCaseByPayment(paymentId: string): CaseRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM recovery_cases WHERE payment_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(paymentId) as CaseRow | undefined;
}

export function updateCase(id: string, patch: Partial<CaseRow>) {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (!keys.length) return;
  const sql = `UPDATE recovery_cases SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  const values = keys.map((k) => (patch as Record<string, unknown>)[k] as string | number | null);
  getDb().prepare(sql).run(...values, id);
}

/* ------------------------------------------------------------ agent actions */

export function logAction(a: {
  case_id: string;
  kind: string;
  tool_name?: string | null;
  tool_input?: unknown;
  tool_result?: unknown;
  text?: string | null;
}) {
  const seq =
    ((getDb()
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM agent_actions WHERE case_id = ?`)
      .get(a.case_id) as { m: number }).m ?? 0) + 1;

  getDb()
    .prepare(
      `INSERT INTO agent_actions (case_id, seq, kind, tool_name, tool_input, tool_result, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      a.case_id,
      seq,
      a.kind,
      a.tool_name ?? null,
      a.tool_input === undefined ? null : JSON.stringify(a.tool_input),
      a.tool_result === undefined ? null : JSON.stringify(a.tool_result),
      a.text ?? null,
      new Date().toISOString()
    );
}

export function getActions(caseId: string): ActionRow[] {
  return getDb()
    .prepare(`SELECT * FROM agent_actions WHERE case_id = ? ORDER BY seq ASC`)
    .all(caseId) as unknown as ActionRow[];
}

/* --------------------------------------------------------------- dashboard */

export function listCases(limit = 100) {
  return getDb()
    .prepare(
      `SELECT c.*, p.amount_paise, p.method, p.bank, p.error_reason, p.description,
              p.failed_at, p.is_recurring, cu.name AS customer_name, cu.email AS customer_email
       FROM recovery_cases c
       JOIN payments p  ON p.id = c.payment_id
       JOIN customers cu ON cu.id = p.customer_id
       ORDER BY p.failed_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
}

export function stats() {
  const db = getDb();
  const atRisk = db
    .prepare(`SELECT COALESCE(SUM(amount_paise), 0) AS v, COUNT(*) AS n FROM payments WHERE status = 'failed'`)
    .get() as { v: number; n: number };
  const recovered = db
    .prepare(`SELECT COALESCE(SUM(recovered_paise), 0) AS v, COUNT(*) AS n
              FROM recovery_cases WHERE status = 'recovered'`)
    .get() as { v: number; n: number };
  const worked = db
    .prepare(`SELECT COUNT(*) AS n FROM recovery_cases WHERE strategy IS NOT NULL`)
    .get() as { n: number };
  const total = db.prepare(`SELECT COUNT(*) AS n FROM recovery_cases`).get() as { n: number };

  const byReason = db
    .prepare(
      `SELECT error_reason AS reason, COUNT(*) AS count, SUM(amount_paise) AS amount_paise
       FROM payments WHERE error_reason IS NOT NULL
       GROUP BY error_reason ORDER BY amount_paise DESC`
    )
    .all() as Array<{ reason: string; count: number; amount_paise: number }>;

  const byStrategy = db
    .prepare(
      `SELECT strategy, COUNT(*) AS count FROM recovery_cases
       WHERE strategy IS NOT NULL GROUP BY strategy ORDER BY count DESC`
    )
    .all() as Array<{ strategy: string; count: number }>;

  const timeline = db
    .prepare(
      `SELECT date(p.failed_at) AS day,
              SUM(p.amount_paise) AS at_risk_paise,
              COALESCE(SUM(c.recovered_paise), 0) AS recovered_paise
       FROM payments p
       LEFT JOIN recovery_cases c ON c.payment_id = p.id AND c.status = 'recovered'
       WHERE p.failed_at IS NOT NULL
       GROUP BY day ORDER BY day ASC`
    )
    .all() as Array<{ day: string; at_risk_paise: number; recovered_paise: number }>;

  return {
    atRiskPaise: atRisk.v,
    failedCount: atRisk.n,
    recoveredPaise: recovered.v,
    recoveredCount: recovered.n,
    casesWorked: worked.n,
    casesTotal: total.n,
    recoveryRate: atRisk.v > 0 ? recovered.v / (atRisk.v + recovered.v) : 0,
    byReason,
    byStrategy,
    timeline,
  };
}
