import type { ActionRow } from "@/lib/queries";

/**
 * The agent's work, in order.
 *
 * Every row here was written by a tool that actually executed, so this is a record of what
 * happened rather than a narration the model produced afterwards. It is the answer to the
 * question a merchant will always ask about an autonomous system: why did it do that?
 */

const TOOL_LABELS: Record<string, string> = {
  get_payment_context: "Pulled payment and customer context",
  check_bank_health: "Checked issuer health",
  schedule_retry: "Scheduled a retry",
  create_payment_link: "Created a Razorpay payment link",
  draft_nudge: "Wrote the customer message",
  mark_uncollectible: "Closed the case as uncollectible",
};

function summarise(toolName: string | null, resultJson: string | null): string | null {
  if (!resultJson) return null;
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(resultJson);
  } catch {
    return null;
  }

  if (r.error) return `⚠ ${String(r.error)}`;

  switch (toolName) {
    case "get_payment_context": {
      const c = r.customer as Record<string, unknown> | undefined;
      const a = r.assessment as Record<string, unknown> | undefined;
      if (!c) return null;
      return `${c.name} · ${c.successful_payments} successful payments · history ${a?.history_quality}`;
    }
    case "check_bank_health":
      return `${r.bank}: ${r.status} · ${r.success_rate_pct}% success${
        r.estimatedRecoveryMinutes ? ` · clears in ~${r.estimatedRecoveryMinutes}m` : ""
      }`;
    case "schedule_retry":
      return r.scheduled
        ? `Retry queued for ${new Date(String(r.retry_at)).toLocaleString("en-IN")} (${r.hours_from_now}h out) via ${r.method}`
        : null;
    case "create_payment_link":
      return `${r.payment_link_url}${r.simulated ? "  (simulated — no Razorpay secret set)" : "  (live test-mode link)"}`;
    case "draft_nudge":
      return `${r.channel} · ${r.characters} characters`;
    case "mark_uncollectible":
      return String(r.reason ?? "");
    default:
      return null;
  }
}

export function AgentTimeline({ actions }: { actions: ActionRow[] }) {
  if (!actions.length) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">The agent has not worked this case yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">How the agent worked this case</h2>
        <p className="mt-1 text-xs text-muted">
          Every step it took, in order — including what came back and how that changed the decision
        </p>
      </div>

      <ol className="relative px-5 py-5">
        {actions.map((a, i) => {
          const isLast = i === actions.length - 1;
          const summary = summarise(a.tool_name, a.tool_result);

          return (
            <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
              {!isLast && (
                <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />
              )}

              <span
                className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  a.kind === "tool_call"
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : a.kind === "conclusion"
                      ? "border-success/40 bg-success/15 text-success"
                      : "border-border bg-surface-2 text-muted"
                }`}
              >
                {a.seq}
              </span>

              <div className="min-w-0 flex-1">
                {a.kind === "tool_call" && (
                  <>
                    <div className="text-sm font-medium">
                      {TOOL_LABELS[a.tool_name ?? ""] ?? a.tool_name}
                    </div>
                    <code className="mt-1 block font-mono text-[11px] text-muted">
                      {a.tool_name}({a.tool_input ?? ""})
                    </code>
                    {summary && (
                      <div className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs break-words">
                        {summary}
                      </div>
                    )}
                  </>
                )}

                {a.kind === "thinking" && (
                  <>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted">
                      Reasoning
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{a.text}</p>
                  </>
                )}

                {a.kind === "conclusion" && (
                  <>
                    <div className="text-xs font-medium uppercase tracking-wider text-success">
                      Decision
                    </div>
                    <p className="mt-1 text-xs text-muted">Case closed and written to the ledger.</p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
