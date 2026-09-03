import { FAILURE_SIGNATURES, type FailureSignature, type PaymentMethod } from "./failures";

/**
 * Generates realistic failed-payment traffic for a mid-size Indian SaaS merchant.
 *
 * Why a simulator at all: reproducing a genuine `payment.failed` event requires a public
 * webhook URL plus test instruments that fail in a specific way — hours of setup for a
 * demo that then depends on the network holding up. The simulator produces the same
 * payload shape and signs it with the real HMAC secret, so the webhook route, its
 * signature verification, and everything downstream run exactly as they would in
 * production. Only the origin of the event is synthetic.
 */

const FIRST_NAMES = [
  "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya",
  "Rahul", "Meera", "Karthik", "Divya", "Siddharth", "Nisha", "Aditya",
  "Pooja", "Manish", "Shreya", "Varun", "Ritika", "Harsh", "Ishita",
];
const LAST_NAMES = [
  "Sharma", "Patel", "Reddy", "Iyer", "Nair", "Gupta", "Mehta", "Desai",
  "Joshi", "Kulkarni", "Banerjee", "Verma", "Rao", "Chauhan", "Pillai",
];
const BANKS = ["HDFC", "SBI", "ICICI", "AXIS", "KOTAK"] as const;

const PLANS = [
  { name: "Starter plan — monthly", paise: 49900, recurring: true },
  { name: "Growth plan — monthly", paise: 199900, recurring: true },
  { name: "Scale plan — monthly", paise: 499900, recurring: true },
  { name: "Growth plan — annual", paise: 1999900, recurring: true },
  { name: "Add-on: extra seats", paise: 89900, recurring: true },
  { name: "One-time setup & onboarding", paise: 1499900, recurring: false },
  { name: "Usage overage — API calls", paise: 34700, recurring: false },
];

// Deterministic PRNG so `npm run seed` produces the same dataset every time.
// A demo that changes shape between runs is a demo you can't rehearse.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulatedCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  prior_success_count: number;
  prior_failure_count: number;
  lifetime_value_paise: number;
  created_at: string;
}

export interface SimulatedPayment {
  id: string;
  order_id: string;
  customer_id: string;
  amount_paise: number;
  currency: string;
  method: PaymentMethod;
  bank: string | null;
  description: string;
  is_recurring: number;
  status: string;
  error_code: string;
  error_reason: string;
  error_source: string;
  error_step: string;
  error_description: string;
  failed_at: string;
  created_at: string;
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function weightedFailure(rnd: () => number): FailureSignature {
  const total = FAILURE_SIGNATURES.reduce((s, f) => s + f.weight, 0);
  let roll = rnd() * total;
  for (const sig of FAILURE_SIGNATURES) {
    roll -= sig.weight;
    if (roll <= 0) return sig;
  }
  return FAILURE_SIGNATURES[0];
}

function id(prefix: string, rnd: () => number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 14; i++) s += chars[Math.floor(rnd() * chars.length)];
  return `${prefix}_${s}`;
}

export function generateDataset(count = 60, seed = 20260905) {
  const rnd = mulberry32(seed);
  const customers: SimulatedCustomer[] = [];
  const payments: SimulatedPayment[] = [];
  const now = Date.now();

  // A pool of customers smaller than the payment count, so some customers fail more
  // than once — that repeat history is exactly what the agent should weigh.
  const customerCount = Math.max(8, Math.floor(count * 0.7));

  for (let i = 0; i < customerCount; i++) {
    const first = pick(rnd, FIRST_NAMES);
    const last = pick(rnd, LAST_NAMES);
    const successes = Math.floor(rnd() * 24);
    customers.push({
      id: id("cust", rnd),
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: `+919${Math.floor(rnd() * 900000000 + 100000000)}`,
      prior_success_count: successes,
      prior_failure_count: Math.floor(rnd() * 3),
      lifetime_value_paise: successes * (49900 + Math.floor(rnd() * 400000)),
      created_at: new Date(now - Math.floor(rnd() * 700) * 86400000).toISOString(),
    });
  }

  for (let i = 0; i < count; i++) {
    const customer = pick(rnd, customers);
    const sig = weightedFailure(rnd);
    const method = pick(rnd, sig.methods);
    const plan = pick(rnd, PLANS);
    // Spread failures across the last 14 days for a believable trend line.
    const failedAt = new Date(now - Math.floor(rnd() * 14 * 86400000));

    payments.push({
      id: id("pay", rnd),
      order_id: id("order", rnd),
      customer_id: customer.id,
      amount_paise: plan.paise,
      currency: "INR",
      method,
      bank: method === "wallet" ? null : pick(rnd, BANKS),
      description: plan.name,
      is_recurring: plan.recurring ? 1 : 0,
      status: "failed",
      error_code: sig.code,
      error_reason: sig.reason,
      error_source: sig.source,
      error_step: sig.step,
      error_description: sig.description,
      failed_at: failedAt.toISOString(),
      created_at: new Date(failedAt.getTime() - 4000).toISOString(),
    });
  }

  return { customers, payments };
}

/**
 * Shapes a payment into the `payment.failed` webhook body Razorpay actually sends,
 * so the webhook route parses the same structure it would in production.
 */
export function toWebhookPayload(p: SimulatedPayment) {
  return {
    entity: "event",
    account_id: "acc_rebound_demo",
    event: "payment.failed",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: p.id,
          entity: "payment",
          amount: p.amount_paise,
          currency: p.currency,
          status: "failed",
          order_id: p.order_id,
          method: p.method,
          bank: p.bank,
          description: p.description,
          error_code: p.error_code,
          error_description: p.error_description,
          error_source: p.error_source,
          error_step: p.error_step,
          error_reason: p.error_reason,
          notes: { customer_id: p.customer_id, recurring: String(p.is_recurring) },
          created_at: Math.floor(new Date(p.created_at).getTime() / 1000),
        },
      },
    },
    created_at: Math.floor(new Date(p.failed_at).getTime() / 1000),
  };
}
