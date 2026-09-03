import type { ReactNode } from "react";

type Tone = "neutral" | "danger" | "success" | "warning" | "accent" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2 text-muted",
  danger: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  accent: "border-accent/30 bg-accent/10 text-accent",
  violet: "border-violet/30 bg-violet/10 text-violet",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Recovery strategies carry meaning: green recovers, red gives up, amber waits. */
export function strategyTone(strategy: string | null): Tone {
  switch (strategy) {
    case "RETRY_SAME":
    case "RETRY_ALTERNATE_METHOD":
      return "accent";
    case "PAYMENT_LINK_NUDGE":
    case "REQUEST_NEW_INSTRUMENT":
      return "violet";
    case "WAIT_FOR_SALARY_CYCLE":
      return "warning";
    case "MARK_UNCOLLECTIBLE":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "recovered":
      return "success";
    case "uncollectible":
      return "danger";
    case "scheduled":
      return "accent";
    case "awaiting_customer":
      return "violet";
    case "pending_approval":
      return "warning";
    case "working":
      return "warning";
    default:
      return "neutral";
  }
}
