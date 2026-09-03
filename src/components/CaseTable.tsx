"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, statusTone, strategyTone } from "./Badge";
import { REASON_LABELS, STRATEGY_LABELS, type Strategy } from "@/lib/failures";
import { relativeTime, rupees } from "@/lib/format";

export interface CaseListRow {
  id: string;
  payment_id: string;
  status: string;
  strategy: string | null;
  amount_paise: number;
  method: string;
  bank: string | null;
  error_reason: string;
  description: string;
  failed_at: string;
  customer_name: string;
  customer_email: string;
}

export function CaseTable({ rows }: { rows: CaseListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAgent(paymentId: string) {
    setRunning(paymentId);
    setError(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Agent run failed");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Recovery cases</h2>
          <p className="mt-1 text-xs text-muted">{rows.length} failed payments awaiting or under recovery</p>
        </div>
        {isPending && <span className="text-xs text-muted">Refreshing…</span>}
      </div>

      {error && (
        <div className="border-b border-danger/30 bg-danger/10 px-5 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Failure</th>
              <th className="px-5 py-3 font-medium">Strategy</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Failed</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
              >
                <td className="px-5 py-3">
                  <Link href={`/cases/${row.id}`} className="block">
                    <div className="font-medium">{row.customer_name}</div>
                    <div className="text-xs text-muted">{row.description}</div>
                  </Link>
                </td>
                <td className="tnum px-5 py-3 font-medium">{rupees(row.amount_paise)}</td>
                <td className="px-5 py-3">
                  <div>{REASON_LABELS[row.error_reason] ?? row.error_reason}</div>
                  <div className="text-xs text-muted">
                    {row.method}
                    {row.bank ? ` · ${row.bank}` : ""}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {row.strategy ? (
                    <Badge tone={strategyTone(row.strategy)}>
                      {STRATEGY_LABELS[row.strategy as Strategy] ?? row.strategy}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted">not worked yet</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-muted">{relativeTime(row.failed_at)}</td>
                <td className="px-5 py-3 text-right">
                  {row.strategy ? (
                    <Link
                      href={`/cases/${row.id}`}
                      className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
                    >
                      View reasoning →
                    </Link>
                  ) : (
                    <button
                      onClick={() => runAgent(row.payment_id)}
                      disabled={running === row.payment_id}
                      className="whitespace-nowrap rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                    >
                      {running === row.payment_id ? "Working…" : "Run agent"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
