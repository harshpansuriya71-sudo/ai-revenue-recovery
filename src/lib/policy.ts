import type { Strategy } from "./failures";

/**
 * Autonomy policy.
 *
 * An agent that acts on merchant money with no supervision is not deployable, whatever its
 * accuracy. This decides, per action, whether the agent may execute immediately or must
 * prepare the action and wait for a person.
 *
 * The distinction that matters: an approval-tier action is genuinely *held* — no Razorpay
 * call is made until someone releases it. A policy that only labels actions after they have
 * already happened is decoration.
 */

export type AutonomyTier = "auto" | "notify" | "approval";

export interface PolicyInput {
  amountPaise: number;
  strategy?: Strategy | string | null;
  customerLtvPaise: number;
  priorSuccessCount: number;
}

export interface PolicyDecision {
  tier: AutonomyTier;
  reason: string;
}

/** Merchant-configurable in a real deployment; constants here so the demo is legible. */
export const POLICY = {
  autoBelowPaise: 200000, // ₹2,000
  approvalAbovePaise: 1000000, // ₹10,000
  highValueCustomerLtvPaise: 3000000, // ₹30,000 lifetime value
};

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  // Writing off a valuable customer is the most expensive mistake available to the agent,
  // and the least reversible. Amount is irrelevant — the relationship is what is at stake.
  if (input.strategy === "MARK_UNCOLLECTIBLE") {
    if (
      input.customerLtvPaise >= POLICY.highValueCustomerLtvPaise ||
      input.priorSuccessCount >= 10
    ) {
      return {
        tier: "approval",
        reason:
          "Writing off a long-standing customer — a person should confirm before this relationship is closed.",
      };
    }
  }

  if (input.amountPaise > POLICY.approvalAbovePaise) {
    return {
      tier: "approval",
      reason: `Above the ₹${(POLICY.approvalAbovePaise / 100).toLocaleString("en-IN")} approval threshold.`,
    };
  }

  if (input.amountPaise < POLICY.autoBelowPaise) {
    return {
      tier: "auto",
      reason: `Under ₹${(POLICY.autoBelowPaise / 100).toLocaleString("en-IN")} — the agent acts without waiting.`,
    };
  }

  return {
    tier: "notify",
    reason: "Mid-value — the agent acts and the merchant is notified.",
  };
}

export const TIER_LABELS: Record<AutonomyTier, string> = {
  auto: "Auto-executed",
  notify: "Executed · merchant notified",
  approval: "Held for approval",
};
