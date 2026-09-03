import { NextResponse } from "next/server";
import { settleOutcomes } from "@/lib/outcomes";

export const runtime = "nodejs";

/**
 * Resolves worked cases into outcomes.
 *
 * Outcomes here are simulated — see src/lib/outcomes.ts. In production this work is done by
 * the `payment.captured` webhook arriving when a retry or payment link actually succeeds.
 */
export async function POST() {
  const result = settleOutcomes();
  return NextResponse.json({ ok: true, simulated: true, ...result });
}
