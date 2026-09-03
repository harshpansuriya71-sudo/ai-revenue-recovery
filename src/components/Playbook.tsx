import type { Insight } from "@/lib/playbook";
import { rupees } from "@/lib/format";

const SEVERITY: Record<Insight["severity"], { dot: string; label: string }> = {
  high: { dot: "bg-danger", label: "text-danger" },
  medium: { dot: "bg-warning", label: "text-warning" },
  low: { dot: "bg-muted", label: "text-muted" },
};

/**
 * Merchant-level recommendations derived from every case the agent has worked.
 *
 * Recovering a payment is worth money; telling a merchant why the payment failed in the first
 * place, and what to change, is worth more.
 */
export function Playbook({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;

  const totalRecoverable = insights.reduce((s, i) => s + i.recoverablePaise, 0);

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Recovery playbook</h2>
          <p className="mt-1 text-xs text-muted">
            Patterns across every case — what is failing, what it costs, what to change
          </p>
        </div>
        {totalRecoverable > 0 && (
          <div className="text-right">
            <div className="tnum text-lg font-semibold text-success">
              {rupees(totalRecoverable, { compact: true })}
            </div>
            <div className="text-[11px] text-muted">addressable if actioned</div>
          </div>
        )}
      </div>

      <ol className="divide-y divide-border">
        {insights.map((insight) => (
          <li key={insight.id} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[insight.severity].dot}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">{insight.headline}</h3>
                  {insight.costPaise > 0 && (
                    <span className="tnum whitespace-nowrap text-xs text-danger">
                      {rupees(insight.costPaise)} lost
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-muted">{insight.detail}</p>

                <div className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-accent">
                    Recommended
                  </div>
                  <p className="mt-1 text-xs leading-relaxed">{insight.action}</p>
                  {insight.recoverablePaise > 0 && (
                    <p className="tnum mt-1.5 text-xs text-success">
                      ≈ {rupees(insight.recoverablePaise)} recoverable
                    </p>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
