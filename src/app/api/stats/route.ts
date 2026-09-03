import { NextResponse } from "next/server";
import { listCases, stats } from "@/lib/queries";

export const runtime = "nodejs";

/** Dashboard aggregates plus the case list, in one round trip. */
export async function GET() {
  return NextResponse.json({
    stats: stats(),
    cases: listCases(200),
  });
}
