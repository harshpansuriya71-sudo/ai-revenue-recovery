import { NextResponse } from "next/server";
import { runAgentOnPayment } from "@/lib/agent/run";
import { getActions, getCase } from "@/lib/queries";

export const runtime = "nodejs";
// The agent makes several sequential model calls; give it room beyond the default.
export const maxDuration = 120;

/** POST { paymentId } — run the recovery agent on one failed payment. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const paymentId = String(body.paymentId ?? "");
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  try {
    const decision = await runAgentOnPayment(paymentId);
    return NextResponse.json({
      ok: true,
      decision,
      case: getCase(decision.caseId),
      actions: getActions(decision.caseId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface the real reason — a missing API key should say so, not read as a 500.
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
