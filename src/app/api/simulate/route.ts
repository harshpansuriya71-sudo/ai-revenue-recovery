import { NextResponse } from "next/server";
import { generateDataset, toWebhookPayload } from "@/lib/simulator";
import { signPayload } from "@/lib/razorpay";
import { upsertCustomer } from "@/lib/queries";

export const runtime = "nodejs";

/**
 * Generates failed payments and delivers them through the real webhook route.
 *
 * The payloads are signed with the same HMAC secret the receiver verifies against, so
 * signature verification, parsing, persistence and case creation all execute exactly as
 * they would for genuine Razorpay traffic.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const count = Math.min(Number(body.count ?? 5), 25);
  const seed = Number(body.seed ?? Date.now() % 100000);

  const { customers, payments } = generateDataset(count, seed);
  // The merchant already knows its own customers; only the payment event arrives by webhook.
  for (const c of customers) upsertCustomer(c);

  const origin = new URL(req.url).origin;
  const results: Array<{ payment_id: string; status: number; case_id?: string }> = [];

  for (const payment of payments) {
    const raw = JSON.stringify(toWebhookPayload(payment));
    const res = await fetch(`${origin}/api/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signPayload(raw),
      },
      body: raw,
    });
    const json = (await res.json().catch(() => ({}))) as { case_id?: string };
    results.push({ payment_id: payment.id, status: res.status, case_id: json.case_id });
  }

  return NextResponse.json({
    ok: true,
    generated: results.length,
    accepted: results.filter((r) => r.status === 200).length,
    results,
  });
}
