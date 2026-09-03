import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Payment IDs for cases the agent has not worked yet, oldest failure first. */
export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT c.payment_id
       FROM recovery_cases c
       JOIN payments p ON p.id = c.payment_id
       WHERE c.strategy IS NULL
       ORDER BY p.failed_at ASC`
    )
    .all() as Array<{ payment_id: string }>;

  return NextResponse.json({ paymentIds: rows.map((r) => r.payment_id) });
}
