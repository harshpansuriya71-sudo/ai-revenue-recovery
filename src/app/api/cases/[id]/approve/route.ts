import { NextResponse } from "next/server";
import { getCase, getCustomer, getPayment, logAction, updateCase } from "@/lib/queries";
import { createPaymentLink } from "@/lib/razorpay";

export const runtime = "nodejs";

/**
 * Releases or rejects an action the autonomy policy held back.
 *
 * The held action was never executed — approving is what actually calls Razorpay. That is
 * the whole point of the policy: above the threshold, nothing reaches the customer until a
 * person says so.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision ?? "approve");

  const kase = getCase(id);
  if (!kase) return NextResponse.json({ error: "No such case" }, { status: 404 });
  if (kase.approval_status !== "pending") {
    return NextResponse.json({ error: "This case is not awaiting approval" }, { status: 400 });
  }

  if (decision === "reject") {
    updateCase(id, {
      approval_status: "rejected",
      status: "uncollectible",
      pending_action: null,
      resolved_at: new Date().toISOString(),
    });
    logAction({
      case_id: id,
      kind: "conclusion",
      text: "Merchant rejected the agent's proposed action. Case closed without recovery.",
    });
    return NextResponse.json({ ok: true, decision: "rejected" });
  }

  const payment = getPayment(kase.payment_id);
  const customer = payment ? getCustomer(payment.customer_id) : undefined;
  if (!payment || !customer) {
    return NextResponse.json({ error: "Case data is incomplete" }, { status: 500 });
  }

  let executed: Record<string, unknown> = { note: "No held action to execute." };

  if (kase.pending_action) {
    const action = JSON.parse(kase.pending_action) as { type: string; expiry_hours?: number };

    if (action.type === "create_payment_link") {
      const link = await createPaymentLink({
        amountPaise: payment.amount_paise,
        description: payment.description,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        expiryHours: action.expiry_hours ?? 48,
        referencePaymentId: payment.id,
      });
      if (link.error) {
        // Leave the case pending so it can be approved again once capacity frees up —
        // silently marking it approved with no link would lose the action.
        return NextResponse.json(
          { error: link.error, stillPending: true },
          { status: 502 }
        );
      }

      updateCase(id, { payment_link_url: link.short_url, payment_link_id: link.id });
      executed = { payment_link_url: link.short_url, simulated: link.simulated };

      logAction({
        case_id: id,
        kind: "tool_call",
        tool_name: "create_payment_link",
        tool_input: { released_by: "merchant approval", expiry_hours: action.expiry_hours },
        tool_result: executed,
      });
    }
  }

  updateCase(id, {
    approval_status: "approved",
    pending_action: null,
    status: kase.strategy === "MARK_UNCOLLECTIBLE" ? "uncollectible" : "scheduled",
  });

  return NextResponse.json({ ok: true, decision: "approved", executed });
}
