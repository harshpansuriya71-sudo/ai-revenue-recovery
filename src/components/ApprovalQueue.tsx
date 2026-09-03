"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rupees } from "@/lib/format";
import { STRATEGY_LABELS, type Strategy } from "@/lib/failures";

export interface PendingCase {
  id: string;
  amount_paise: number;
  strategy: string | null;
  approval_reason: string | null;
  customer_name: string;
  description: string;
  diagnosis: string | null;
}

/**
 * Actions the autonomy policy held back.
 *
 * These have not happened. No payment link exists and nothing has reached the customer until
 * someone here releases it — which is what makes the policy a control rather than a label.
 */
export function ApprovalQueue({ cases }: { cases: PendingCase[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!cases.length) return null;

  // Show only the most valuable few. A long queue pushes the rest of the dashboard off
  // screen, and the point of this panel is that approvals exist — not to be a work surface.
  const VISIBLE = 4;
  const shown = cases.slice(0, VISIBLE);
  const remaining = cases.length - shown.length;
  const remainingPaise = cases.slice(VISIBLE).reduce((sum, c) => sum + c.amount_paise, 0);

  return (
    <section className="rounded-xl border border-warning/30 bg-warning/[0.05]">
      <div className="flex items-center justify-between border-b border-warning/20 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-warning">Waiting for your approval</h2>
          <p className="mt-1 text-xs text-muted">
            The agent prepared these but did not execute them — nothing has reached the customer
          </p>
        </div>
        <span className="tnum text-lg font-semibold text-warning">{cases.length}</span>
      </div>

      {error && <div className="px-5 py-2 text-xs text-danger">{error}</div>}

      <ul className="divide-y divide-warning/15">
        {shown.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <Link href={`/cases/${c.id}`} className="block">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="tnum font-semibold">{rupees(c.amount_paise)}</span>
                  <span className="text-sm">{c.customer_name}</span>
                  {c.strategy && (
                    <span className="text-xs text-muted">
                      · {STRATEGY_LABELS[c.strategy as Strategy] ?? c.strategy}
                    </span>
                  )}
                </div>
                {c.approval_reason && (
                  <p className="mt-1 text-xs text-muted">{c.approval_reason}</p>
                )}
              </Link>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => decide(c.id, "reject")}
                disabled={busy === c.id}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => decide(c.id, "approve")}
                disabled={busy === c.id}
                className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === c.id ? "Working…" : "Approve"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="border-t border-warning/20 px-5 py-3 text-xs text-muted">
          {remaining} more worth {rupees(remainingPaise)} also waiting — approve them from the
          case list below.
        </div>
      )}
    </section>
  );
}
