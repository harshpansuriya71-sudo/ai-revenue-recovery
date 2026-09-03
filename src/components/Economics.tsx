import type { Economics as Econ } from "@/lib/economics";
import { rupees } from "@/lib/format";

/**
 * What running the agent costs against what it brings back.
 *
 * The standing objection to putting a model in front of every failed payment is that
 * inference might cost more than the recovery is worth. That deserves a measured answer
 * rather than an assurance.
 */
export function Economics({ econ }: { econ: Econ }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">What the agent costs to run</h2>
      <p className="mt-1 text-xs text-muted">Measured from actual model calls</p>

      <div className="mt-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">Inference cost</span>
          <span className="tnum text-lg font-semibold text-danger">{rupees(econ.costPaise)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">Revenue recovered</span>
          <span className="tnum text-lg font-semibold text-success">
            {rupees(econ.recoveredPaise, { compact: true })}
          </span>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium">Return on spend</span>
            <span className="tnum text-2xl font-semibold text-accent">
              {econ.returnMultiple >= 1000
                ? `${Math.round(econ.returnMultiple).toLocaleString("en-IN")}×`
                : `${econ.returnMultiple.toFixed(0)}×`}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Working one case costs about{" "}
            {econ.costPerCasePaise < 100
              ? `${econ.costPerCasePaise.toFixed(0)} paise`
              : rupees(Math.round(econ.costPerCasePaise))}
            . Recovering one is worth thousands of rupees.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
          <div>
            <dt className="text-muted">Model calls</dt>
            <dd className="tnum mt-0.5 font-medium">{econ.modelCalls.toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt className="text-muted">Per case</dt>
            <dd className="tnum mt-0.5 font-medium">
              {/* Rounding to whole rupees renders this as "₹0", which says nothing. */}
              {econ.costPerCasePaise < 100
                ? `${econ.costPerCasePaise.toFixed(0)} paise`
                : rupees(Math.round(econ.costPerCasePaise))}{" "}
              · {econ.callsPerCase.toFixed(1)} calls
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
        {econ.assumption}
      </p>
    </div>
  );
}
