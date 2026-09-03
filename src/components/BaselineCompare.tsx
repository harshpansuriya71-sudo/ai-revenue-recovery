import { rupees, percent } from "@/lib/format";

/**
 * Rebound versus the industry default.
 *
 * A recovery rate on its own means nothing without something to compare it to — the honest
 * question is not "did it recover money" but "did it recover more than a blind retry would
 * have". This is that comparison.
 */
export function BaselineCompare({
  recoveredPaise,
  recoveryRate,
  baselinePaise,
  baselineRate,
  workedCount,
}: {
  recoveredPaise: number;
  recoveryRate: number;
  baselinePaise: number;
  baselineRate: number;
  workedCount: number;
}) {
  const delta = recoveredPaise - baselinePaise;
  const max = Math.max(recoveredPaise, baselinePaise, 1);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Rebound vs a fixed 24-hour retry</h2>
      <p className="mt-1 text-xs text-muted">
        The same {workedCount} cases the agent worked, scored two ways
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-success">Rebound</span>
            <span className="tnum text-muted">
              {rupees(recoveredPaise)} · {percent(recoveryRate)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${(recoveredPaise / max) * 100}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-muted">Fixed 24h retry</span>
            <span className="tnum text-muted">
              {rupees(baselinePaise)} · {percent(baselineRate)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-muted/50"
              style={{ width: `${(baselinePaise / max) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {delta > 0 && (
        <p className="mt-5 border-t border-border pt-4 text-sm">
          <span className="tnum font-semibold text-success">{rupees(delta)}</span>
          <span className="text-muted"> recovered that a blind retry would have missed</span>
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Outcomes are simulated from each strategy&apos;s fit to the actual root cause. In
        production they arrive as <code className="font-mono">payment.captured</code> webhooks.
      </p>
    </div>
  );
}
