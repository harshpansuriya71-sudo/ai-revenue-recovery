"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rupees, shortDate } from "@/lib/format";

interface Point {
  day: string;
  at_risk_paise: number;
  recovered_paise: number;
}

export function RecoveryChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({
    day: shortDate(d.day),
    "At risk": d.at_risk_paise / 100,
    Recovered: d.recovered_paise / 100,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Revenue at risk vs recovered</h2>
      <p className="mt-1 text-xs text-muted">Daily totals across the last 14 days</p>

      <div className="mt-5 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="atRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f4574d" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f4574d" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="recovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#262a32" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="#8c939f"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#262a32" }}
            />
            <YAxis
              stroke="#8c939f"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => rupees(v * 100, { compact: true })}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1d23",
                border: "1px solid #262a32",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#8c939f" }}
              formatter={(v) => rupees(Number(v ?? 0) * 100)}
            />
            <Area
              type="monotone"
              dataKey="At risk"
              stroke="#f4574d"
              strokeWidth={2}
              fill="url(#atRisk)"
            />
            <Area
              type="monotone"
              dataKey="Recovered"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#recovered)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex gap-5 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-danger" /> At risk
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" /> Recovered
        </span>
      </div>
    </div>
  );
}
