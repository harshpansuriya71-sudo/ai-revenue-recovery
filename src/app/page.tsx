import { listCases, pendingApprovals, stats } from "@/lib/queries";
import { rupees, percent } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { RecoveryChart } from "@/components/RecoveryChart";
import { FailureBreakdown } from "@/components/FailureBreakdown";
import { CaseTable, type CaseListRow } from "@/components/CaseTable";
import { RunAllButton } from "@/components/RunAllButton";
import { BaselineCompare } from "@/components/BaselineCompare";
import { baselineComparison } from "@/lib/outcomes";
import { buildPlaybook } from "@/lib/playbook";
import { computeEconomics } from "@/lib/economics";
import { Playbook } from "@/components/Playbook";
import { ApprovalQueue, type PendingCase } from "@/components/ApprovalQueue";
import { Economics } from "@/components/Economics";

// Every load reflects current database state; the agent changes it as it works.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const s = stats();
  const cases = listCases(200) as unknown as CaseListRow[];
  const base = baselineComparison();
  const insights = buildPlaybook();
  const econ = computeEconomics();
  const pending = pendingApprovals() as unknown as PendingCase[];

  const unworked = cases.filter((c) => !c.strategy);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Rebound</h1>
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
              Razorpay · Test Mode
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            An AI agent that works every failed payment — diagnosing the root cause, then choosing
            a recovery strategy that matches it.
          </p>
        </div>
        <RunAllButton pending={unworked.length} />
      </header>

      {pending.length > 0 && (
        <div className="mt-6">
          <ApprovalQueue cases={pending} />
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue at risk"
          value={rupees(s.totalAtRiskPaise, { compact: true })}
          sub={`${s.failedCount + s.recoveredCount} failed payments`}
          tone="danger"
        />
        <StatCard
          label="Recovered"
          value={rupees(s.recoveredPaise, { compact: true })}
          sub={`${s.recoveredCount} rescued · ${rupees(s.atRiskPaise, { compact: true })} still open`}
          tone="success"
        />
        {/* Scoped to cases the agent has actually worked, so it matches the baseline panel.
            Rating it against untouched cases would just measure how much is left to do. */}
        <StatCard
          label="Recovery rate"
          value={percent(base.reboundRate)}
          sub={`of ${rupees(base.workedPaise, { compact: true })} worked`}
          tone="accent"
        />
        <StatCard
          label="Cases worked"
          value={`${s.casesWorked} / ${s.casesTotal}`}
          sub={unworked.length ? `${unworked.length} awaiting the agent` : "all cases worked"}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <RecoveryChart data={s.timeline} />
        <div className="space-y-4">
          <BaselineCompare
            recoveredPaise={base.reboundPaise}
            recoveryRate={base.reboundRate}
            baselinePaise={base.baselinePaise}
            baselineRate={base.baselineRate}
            workedCount={base.workedCount}
          />
          <FailureBreakdown rows={s.byReason} />
        </div>
      </section>

      {s.byStrategy.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Strategies chosen by the agent</h2>
          <p className="mt-1 text-xs text-muted">
            A fixed-schedule retry would show one bar here. That difference is the point.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.byStrategy.map((row) => (
              <div
                key={row.strategy}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <div className="text-xs text-muted">{row.strategy}</div>
                <div className="tnum mt-0.5 text-lg font-semibold">{row.count}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Playbook insights={insights} />
        <Economics econ={econ} />
      </section>

      <section className="mt-6">
        <CaseTable rows={cases} />
      </section>
    </main>
  );
}
