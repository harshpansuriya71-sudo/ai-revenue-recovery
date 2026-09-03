import Link from "next/link";
import { notFound } from "next/navigation";
import { getActions, getCaseDetail } from "@/lib/queries";
import { REASON_LABELS, STRATEGY_LABELS, type Strategy } from "@/lib/failures";
import { futureTime, relativeTime, rupees } from "@/lib/format";
import { Badge, statusTone, strategyTone } from "@/components/Badge";
import { AgentTimeline } from "@/components/AgentTimeline";
import { NudgePreview } from "@/components/NudgePreview";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const c = getCaseDetail(id) as Record<string, string | number | null> | undefined;
  if (!c) notFound();

  const actions = getActions(id);
  const strategy = c.strategy as string | null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link href="/" className="text-xs text-muted transition-colors hover:text-accent">
        ← All cases
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {rupees(Number(c.amount_paise))}
            </h1>
            <Badge tone={statusTone(String(c.status))}>{String(c.status)}</Badge>
            {strategy && (
              <Badge tone={strategyTone(strategy)}>
                {STRATEGY_LABELS[strategy as Strategy] ?? strategy}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {String(c.description)} · {String(c.customer_name)} ·{" "}
            {relativeTime(String(c.failed_at))}
          </p>
        </div>
      </header>

      {/* The agent's verdict, stated plainly up front. */}
      {strategy && (
        <section className="mt-6 rounded-xl border border-accent/25 bg-accent/[0.06] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-accent">
              Agent decision
            </span>
            {c.confidence != null && (
              <span className="tnum text-xs text-muted">
                confidence {(Number(c.confidence) * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {c.diagnosis && <p className="mt-3 text-base font-medium">{String(c.diagnosis)}</p>}
          {c.reasoning && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{String(c.reasoning)}</p>
          )}
          {c.retry_at && (
            <p className="mt-3 text-sm">
              <span className="text-muted">Retry scheduled </span>
              <span className="font-medium">{futureTime(String(c.retry_at))}</span>
              <span className="text-muted">
                {" "}
                via {String(c.retry_method)} ·{" "}
                {new Date(String(c.retry_at)).toLocaleString("en-IN")}
              </span>
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          {/* The raw Razorpay error signature — the input the agent reasoned from. */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Razorpay failure signature</h2>
            <p className="mt-1 text-xs text-muted">
              The four fields that determine what recovery is even possible
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <Field
                label="error_reason"
                value={
                  <span className="font-medium">
                    {REASON_LABELS[String(c.error_reason)] ?? String(c.error_reason)}
                  </span>
                }
              />
              <Field label="error_source" value={String(c.error_source)} />
              <Field label="error_step" value={String(c.error_step)} />
              <Field label="error_code" value={String(c.error_code)} />
            </dl>
            {c.error_description && (
              <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                {String(c.error_description)}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
              <Field
                label="Method"
                value={`${String(c.method)}${c.bank ? ` · ${String(c.bank)}` : ""}`}
              />
              <Field label="Type" value={c.is_recurring ? "Recurring" : "One-time"} />
              <Field label="Payment ID" value={<code className="font-mono text-xs">{String(c.payment_id)}</code>} />
              <Field label="Order ID" value={<code className="font-mono text-xs">{String(c.order_id)}</code>} />
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Customer</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Name" value={String(c.customer_name)} />
              <Field label="Email" value={<span className="text-xs">{String(c.customer_email)}</span>} />
              <Field
                label="Payment history"
                value={
                  <span>
                    <span className="text-success">{String(c.prior_success_count)} paid</span>
                    {" · "}
                    <span className="text-danger">{String(c.prior_failure_count)} failed</span>
                  </span>
                }
              />
              <Field label="Lifetime value" value={rupees(Number(c.lifetime_value_paise))} />
            </dl>
          </section>
        </div>

        <div className="space-y-4">
          <AgentTimeline actions={actions} />
          {c.nudge_message && (
            <NudgePreview
              channel={c.nudge_channel as string | null}
              message={String(c.nudge_message)}
              linkUrl={(c.payment_link_url as string | null) ?? null}
            />
          )}
        </div>
      </div>
    </main>
  );
}
