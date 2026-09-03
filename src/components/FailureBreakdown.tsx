import { REASON_LABELS } from "@/lib/failures";
import { rupees } from "@/lib/format";

interface Row {
  reason: string;
  count: number;
  amount_paise: number;
}

/**
 * Sorted by rupees at stake rather than by count — the merchant cares which failures
 * are costing the most money, not which happen most often.
 */
export function FailureBreakdown({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.amount_paise), 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Where the money is failing</h2>
      <p className="mt-1 text-xs text-muted">By root cause, ranked by rupees at stake</p>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.reason}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{REASON_LABELS[row.reason] ?? row.reason}</span>
              <span className="tnum text-muted">
                {rupees(row.amount_paise)} · {row.count}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(row.amount_paise / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
