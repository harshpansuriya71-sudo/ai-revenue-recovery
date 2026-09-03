import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createCase, getCaseByPayment, getCustomer, upsertCustomer, upsertPayment } from "@/lib/queries";

export const runtime = "nodejs";

/**
 * Razorpay webhook receiver.
 *
 * The raw request body must be read as text and verified BEFORE parsing — HMAC is computed
 * over the exact bytes Razorpay sent, so parsing and re-serialising first would produce a
 * different digest and every legitimate event would be rejected.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Reject before touching the payload at all — an unverified body is untrusted input.
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
    created_at?: number;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  if (event.event !== "payment.failed") {
    return NextResponse.json({ ok: true, ignored: event.event ?? "unknown" });
  }

  const e = event.payload?.payment?.entity;
  if (!e?.id) {
    return NextResponse.json({ error: "Missing payment entity" }, { status: 400 });
  }

  const notes = (e.notes ?? {}) as Record<string, string>;
  const customerId = notes.customer_id ?? "cust_unknown";

  // A real merchant already has the customer in their own database; if this event arrives
  // for someone we have never seen, record a placeholder rather than dropping the event.
  if (!getCustomer(customerId)) {
    upsertCustomer({
      id: customerId,
      name: "Unknown customer",
      email: "unknown@example.com",
      phone: "+910000000000",
      prior_success_count: 0,
      prior_failure_count: 0,
      lifetime_value_paise: 0,
      created_at: new Date().toISOString(),
    });
  }

  const failedAt = new Date((event.created_at ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  upsertPayment({
    id: String(e.id),
    order_id: String(e.order_id ?? ""),
    customer_id: customerId,
    amount_paise: Number(e.amount ?? 0),
    currency: String(e.currency ?? "INR"),
    method: String(e.method ?? "unknown"),
    bank: e.bank ? String(e.bank) : null,
    description: String(e.description ?? "Payment"),
    is_recurring: notes.recurring === "1" ? 1 : 0,
    status: "failed",
    error_code: e.error_code ? String(e.error_code) : null,
    error_reason: e.error_reason ? String(e.error_reason) : null,
    error_source: e.error_source ? String(e.error_source) : null,
    error_step: e.error_step ? String(e.error_step) : null,
    error_description: e.error_description ? String(e.error_description) : null,
    failed_at: failedAt,
    created_at: new Date(Number(e.created_at ?? 0) * 1000 || Date.now()).toISOString(),
  });

  const existing = getCaseByPayment(String(e.id));
  const kase = existing ?? createCase(String(e.id));

  return NextResponse.json({
    ok: true,
    payment_id: e.id,
    case_id: kase.id,
    verified: true,
  });
}
