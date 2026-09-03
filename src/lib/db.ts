import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * SQLite via Node 24's built-in driver — no native compilation, no server, no Docker.
 * The database is a single file at data/rebound.db (gitignored).
 */

const DB_PATH = path.join(process.cwd(), "data", "rebound.db");

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);

  instance = db;
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      email                 TEXT NOT NULL,
      phone                 TEXT NOT NULL,
      -- recovery signal: a customer with a long clean history deserves more patience
      prior_success_count   INTEGER NOT NULL DEFAULT 0,
      prior_failure_count   INTEGER NOT NULL DEFAULT 0,
      lifetime_value_paise  INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id             TEXT PRIMARY KEY,            -- pay_xxx, mirrors Razorpay's id shape
      order_id       TEXT NOT NULL,
      customer_id    TEXT NOT NULL REFERENCES customers(id),
      amount_paise   INTEGER NOT NULL,            -- Razorpay works in paise, never rupees
      currency       TEXT NOT NULL DEFAULT 'INR',
      method         TEXT NOT NULL,               -- upi | card | netbanking | wallet
      bank           TEXT,                        -- HDFC | SBI | ICICI | AXIS | KOTAK
      description    TEXT NOT NULL,
      is_recurring   INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL,               -- failed | captured | recovered | uncollectible
      -- the four fields the agent actually reasons over
      error_code     TEXT,
      error_reason   TEXT,
      error_source   TEXT,                        -- bank | customer | gateway | issuer | business
      error_step     TEXT,                        -- payment_initiation | _authentication | _authorization
      error_description TEXT,
      failed_at      TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_cases (
      id                 TEXT PRIMARY KEY,
      payment_id         TEXT NOT NULL REFERENCES payments(id),
      status             TEXT NOT NULL,           -- pending | working | scheduled | recovered | uncollectible
      strategy           TEXT,                    -- RETRY_SAME | RETRY_ALTERNATE_METHOD | ...
      diagnosis          TEXT,                    -- the agent's read on the root cause
      reasoning          TEXT,                    -- why this strategy over the others
      confidence         REAL,
      retry_at           TEXT,
      retry_method       TEXT,
      payment_link_url   TEXT,
      payment_link_id    TEXT,
      nudge_channel      TEXT,
      nudge_message      TEXT,
      recovered_paise    INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL,
      resolved_at        TEXT
    );

    -- Every tool call the agent makes. This table is what draws the reasoning timeline.
    CREATE TABLE IF NOT EXISTS agent_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id     TEXT NOT NULL REFERENCES recovery_cases(id),
      seq         INTEGER NOT NULL,
      kind        TEXT NOT NULL,                  -- thinking | tool_call | conclusion
      tool_name   TEXT,
      tool_input  TEXT,                           -- JSON
      tool_result TEXT,                           -- JSON
      text        TEXT,                           -- reasoning summary, for thinking/conclusion rows
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_cases_payment    ON recovery_cases(payment_id);
    CREATE INDEX IF NOT EXISTS idx_actions_case     ON agent_actions(case_id, seq);
  `);
}

export function resetDb() {
  const db = getDb();
  db.exec(`
    DELETE FROM agent_actions;
    DELETE FROM recovery_cases;
    DELETE FROM payments;
    DELETE FROM customers;
  `);
}
