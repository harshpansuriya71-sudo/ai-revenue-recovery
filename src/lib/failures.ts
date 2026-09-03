/**
 * Razorpay failure signatures.
 *
 * These mirror the real shape of a `payment.failed` webhook: every failure carries an
 * error_code / error_reason / error_source / error_step quadruple. The whole premise of
 * Rebound is that these four fields imply *different* recovery strategies — and that
 * fixed-schedule retries throw that information away.
 *
 * Reference: https://razorpay.com/docs/payments/payments/payment-failure-reasons/
 */

export type ErrorSource = "bank" | "customer" | "gateway" | "issuer" | "business";
export type ErrorStep =
  | "payment_initiation"
  | "payment_authentication"
  | "payment_authorization";
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet";

export interface FailureSignature {
  reason: string;
  code: "BAD_REQUEST_ERROR" | "GATEWAY_ERROR";
  source: ErrorSource;
  step: ErrorStep;
  description: string;
  methods: PaymentMethod[];
  /** relative frequency in the seeded dataset — roughly mirrors real Indian PG distributions */
  weight: number;
  /** is the underlying cause expected to clear on its own? drives whether a blind retry is sane */
  selfResolving: boolean;
}

export const FAILURE_SIGNATURES: FailureSignature[] = [
  {
    reason: "insufficient_funds",
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authorization",
    description: "Your account does not have enough balance to complete this transaction.",
    methods: ["upi", "card", "netbanking"],
    weight: 24,
    selfResolving: true, // clears on payday — but not in 24h
  },
  {
    reason: "payment_timeout",
    code: "GATEWAY_ERROR",
    source: "gateway",
    step: "payment_authentication",
    description: "Payment was not completed within the allowed time.",
    methods: ["upi", "netbanking"],
    weight: 15,
    selfResolving: true,
  },
  {
    reason: "gateway_technical_error",
    code: "GATEWAY_ERROR",
    source: "gateway",
    step: "payment_authorization",
    description: "Payment processing failed due to a technical error at the gateway.",
    methods: ["upi", "card", "netbanking", "wallet"],
    weight: 12,
    selfResolving: true, // usually minutes, not hours
  },
  {
    reason: "bank_down",
    code: "GATEWAY_ERROR",
    source: "bank",
    step: "payment_authorization",
    description: "The customer's bank is currently unavailable.",
    methods: ["upi", "netbanking"],
    weight: 11,
    selfResolving: true,
  },
  {
    reason: "incorrect_otp",
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authentication",
    description: "The OTP entered was incorrect.",
    methods: ["card", "netbanking"],
    weight: 9,
    selfResolving: false, // needs the customer to act again
  },
  {
    reason: "upi_collect_expired",
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authentication",
    description: "The UPI collect request expired before the customer approved it.",
    methods: ["upi"],
    weight: 8,
    selfResolving: false,
  },
  {
    reason: "card_expired",
    code: "BAD_REQUEST_ERROR",
    source: "issuer",
    step: "payment_authorization",
    description: "The card used has expired.",
    methods: ["card"],
    weight: 6,
    selfResolving: false, // retrying this is pure waste — it will never succeed
  },
  {
    reason: "limit_exceeded",
    code: "BAD_REQUEST_ERROR",
    source: "issuer",
    step: "payment_authorization",
    description: "The transaction exceeds the per-transaction or daily limit on this instrument.",
    methods: ["upi", "card", "netbanking"],
    weight: 6,
    selfResolving: true, // UPI daily limits reset at midnight
  },
  {
    reason: "mandate_revoked",
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authorization",
    description: "The customer has cancelled the auto-debit mandate for this subscription.",
    methods: ["upi", "card"],
    weight: 5,
    selfResolving: false, // an explicit customer decision — retrying is hostile
  },
  {
    reason: "invalid_vpa",
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_initiation",
    description: "The UPI ID entered does not exist or is no longer active.",
    methods: ["upi"],
    weight: 4,
    selfResolving: false,
  },
];

export function signatureFor(reason: string): FailureSignature | undefined {
  return FAILURE_SIGNATURES.find((s) => s.reason === reason);
}

/** Human-readable label for dashboard grouping. */
export const REASON_LABELS: Record<string, string> = {
  insufficient_funds: "Insufficient funds",
  payment_timeout: "Payment timeout",
  gateway_technical_error: "Gateway error",
  bank_down: "Bank downtime",
  incorrect_otp: "Wrong OTP",
  upi_collect_expired: "UPI request expired",
  card_expired: "Card expired",
  limit_exceeded: "Limit exceeded",
  mandate_revoked: "Mandate revoked",
  invalid_vpa: "Invalid UPI ID",
};

/** The strategies the agent is allowed to choose between. */
export const STRATEGIES = [
  "RETRY_SAME",
  "RETRY_ALTERNATE_METHOD",
  "PAYMENT_LINK_NUDGE",
  "WAIT_FOR_SALARY_CYCLE",
  "REQUEST_NEW_INSTRUMENT",
  "MARK_UNCOLLECTIBLE",
] as const;

export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABELS: Record<Strategy, string> = {
  RETRY_SAME: "Retry same method",
  RETRY_ALTERNATE_METHOD: "Retry via another method",
  PAYMENT_LINK_NUDGE: "Send payment link",
  WAIT_FOR_SALARY_CYCLE: "Wait for salary cycle",
  REQUEST_NEW_INSTRUMENT: "Ask for new card/UPI",
  MARK_UNCOLLECTIBLE: "Write off",
};
