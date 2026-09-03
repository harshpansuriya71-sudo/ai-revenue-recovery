import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger" | "success" | "accent";
  icon?: ReactNode;
}) {
  const valueTone = {
    default: "text-foreground",
    danger: "text-danger",
    success: "text-success",
    accent: "text-accent",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        {icon}
      </div>
      <div className={`tnum mt-3 text-3xl font-semibold ${valueTone}`}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
