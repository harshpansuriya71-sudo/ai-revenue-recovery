import crypto from "node:crypto";
import Razorpay from "razorpay";

/**
 * Razorpay integration (Test Mode).
 *
 * Two things happen here for real:
 *   1. Payment Links are created through the live Razorpay API — the URLs open a genuine
 *      test-mode checkout page.
 *   2. Webhook signatures are verified with HMAC-SHA256 and a timing-safe comparison,
 *      exactly as a production integration must.
 */

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "rebound_local_webhook_secret";

export function razorpayConfigured() {
  return Boolean(KEY_ID && KEY_SECRET);
}

let client: Razorpay | null = null;
function getClient(): Razorpay {
  if (!client) {
    if (!razorpayConfigured()) throw new Error("Razorpay keys are not configured");
    client = new Razorpay({ key_id: KEY_ID!, key_secret: KEY_SECRET! });
  }
  return client;
}

/* ------------------------------------------------------- webhook signatures */

export function signPayload(rawBody: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

/**
 * Timing-safe signature check. A plain `===` here would leak the expected signature
 * one byte at a time to an attacker measuring response times.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signPayload(rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ----------------------------------------------------------- payment links */

export interface PaymentLinkResult {
  id: string;
  short_url: string;
  simulated: boolean;
  note?: string;
}

export async function createPaymentLink(params: {
  amountPaise: number;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  expiryHours: number;
  referencePaymentId: string;
}): Promise<PaymentLinkResult> {
  // Razorpay requires expire_by to be at least 15 minutes out, and it is a unix timestamp.
  const expireBy = Math.floor(Date.now() / 1000) + Math.max(params.expiryHours, 1) * 3600;

  if (!razorpayConfigured()) {
    // The agent should still be able to complete a case without keys configured, so the
    // dashboard and the reasoning timeline stay demonstrable. Clearly flagged as simulated.
    return {
      id: `plink_sim_${params.referencePaymentId.slice(-8)}`,
      short_url: `https://rzp.io/i/simulated-${params.referencePaymentId.slice(-6)}`,
      simulated: true,
      note: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — link is simulated, not live.",
    };
  }

  const link = await getClient().paymentLink.create({
    amount: params.amountPaise,
    currency: "INR",
    accept_partial: false,
    description: params.description.slice(0, 2048),
    customer: {
      name: params.customerName,
      email: params.customerEmail,
      contact: params.customerPhone,
    },
    // The agent writes and owns the customer messaging, so Razorpay's own
    // notifications stay off to avoid double-contacting the customer.
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: expireBy,
    notes: {
      recovered_by: "rebound-agent",
      original_payment_id: params.referencePaymentId,
    },
  });

  return {
    id: String(link.id),
    short_url: String(link.short_url),
    simulated: false,
  };
}
