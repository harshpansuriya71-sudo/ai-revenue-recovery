"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Runs the agent and renders each step as it arrives.
 *
 * The completed timeline elsewhere proves what the agent did; this proves it is happening
 * now. Watching the bank-health lookup come back and change the decision is a different
 * thing entirely from reading about it afterwards.
 */

type Step =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; tool: string; args: string; result?: string; pending: boolean }
  | { kind: "decision"; strategy: string; diagnosis: string; reasoning: string }
  | { kind: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  get_payment_context: "Pulling payment and customer context",
  check_bank_health: "Checking issuer health",
  schedule_retry: "Scheduling a retry",
  create_payment_link: "Creating a Razorpay payment link",
  draft_nudge: "Writing the customer message",
  mark_uncollectible: "Closing the case as uncollectible",
};

function summarise(tool: string, result: Record<string, unknown>): string {
  if (result.error) return `⚠ ${String(result.error)}`;
  switch (tool) {
    case "get_payment_context": {
      const c = result.customer as Record<string, unknown> | undefined;
      const a = result.assessment as Record<string, unknown> | undefined;
      return c ? `${c.name} · ${c.successful_payments} prior payments · history ${a?.history_quality}` : "";
    }
    case "check_bank_health":
      return `${result.bank}: ${result.status} · ${result.success_rate_pct}% success${
        result.estimatedRecoveryMinutes ? ` · clears in ~${result.estimatedRecoveryMinutes}m` : ""
      }`;
    case "schedule_retry":
      return result.scheduled
        ? `Queued ${result.hours_from_now}h out via ${result.method}`
        : "Rejected";
    case "create_payment_link":
      return String(result.payment_link_url ?? "");
    case "draft_nudge":
      return `${result.channel} · ${result.characters} characters`;
    case "mark_uncollectible":
      return String(result.reason ?? "");
    default:
      return "";
  }
}

export function LiveAgentRunner({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  function run() {
    setSteps([]);
    setRunning(true);

    const es = new EventSource(`/api/agent/stream?paymentId=${encodeURIComponent(paymentId)}`);
    sourceRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === "thinking") {
        setSteps((s) => [...s, { kind: "thinking", text: event.text }]);
      }

      if (event.type === "tool_call") {
        setSteps((s) => [
          ...s,
          { kind: "tool", tool: event.tool, args: JSON.stringify(event.args), pending: true },
        ]);
      }

      if (event.type === "tool_result") {
        // Attach the result to the most recent pending call of the same tool.
        setSteps((s) => {
          const next = [...s];
          for (let i = next.length - 1; i >= 0; i--) {
            const step = next[i];
            if (step.kind === "tool" && step.tool === event.tool && step.pending) {
              next[i] = { ...step, pending: false, result: summarise(event.tool, event.result) };
              break;
            }
          }
          return next;
        });
      }

      if (event.type === "decision") {
        setSteps((s) => [
          ...s,
          {
            kind: "decision",
            strategy: event.decision.strategy,
            diagnosis: event.decision.diagnosis,
            reasoning: event.decision.reasoning,
          },
        ]);
      }

      if (event.type === "error") {
        setSteps((s) => [...s, { kind: "error", message: event.message }]);
      }
    };

    es.addEventListener("done", () => {
      es.close();
      setRunning(false);
      router.refresh();
    });

    es.onerror = () => {
      es.close();
      setRunning(false);
      // Only surface a connection failure if nothing useful arrived — otherwise the stream
      // simply ended and the steps already on screen tell the story.
      setSteps((s) =>
        s.length
          ? s
          : [{ kind: "error", message: "Lost connection to the agent stream. Check the server is running." }]
      );
    };
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Run the agent</h2>
          <p className="mt-1 text-xs text-muted">
            {running ? "Working the case…" : "Watch it diagnose this failure live"}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Working…" : "Run agent"}
        </button>
      </div>

      {steps.length > 0 && (
        <ol className="space-y-3 px-5 py-5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  step.kind === "decision"
                    ? "bg-success"
                    : step.kind === "error"
                      ? "bg-danger"
                      : step.kind === "tool" && step.pending
                        ? "animate-pulse bg-warning"
                        : "bg-accent"
                }`}
              />
              <div className="min-w-0 flex-1">
                {step.kind === "thinking" && (
                  <p className="text-sm whitespace-pre-wrap text-muted">{step.text}</p>
                )}

                {step.kind === "tool" && (
                  <>
                    <div className="text-sm font-medium">
                      {TOOL_LABELS[step.tool] ?? step.tool}
                      {step.pending && <span className="ml-2 text-xs text-warning">running…</span>}
                    </div>
                    {step.result && (
                      <div className="mt-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs break-words">
                        {step.result}
                      </div>
                    )}
                  </>
                )}

                {step.kind === "decision" && (
                  <>
                    <div className="text-xs font-medium uppercase tracking-wider text-success">
                      Decision · {step.strategy}
                    </div>
                    <p className="mt-1 text-sm font-medium">{step.diagnosis}</p>
                    <p className="mt-1 text-sm text-muted">{step.reasoning}</p>
                  </>
                )}

                {step.kind === "error" && (
                  <p className="text-sm text-danger">{step.message}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
