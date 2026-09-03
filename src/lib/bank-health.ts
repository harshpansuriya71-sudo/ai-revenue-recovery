/**
 * Mocked bank/PSP health feed.
 *
 * In production this would be Razorpay's own downtime API (`/v1/payments/downtimes`),
 * which reports live issuer and UPI-handle degradation. Here it is deterministic so the
 * demo is reproducible: HDFC UPI is mid-incident, which is what lets the agent justify
 * "retry in 2 hours" instead of the industry-standard blind 24-hour retry.
 */

export type BankCode = "HDFC" | "SBI" | "ICICI" | "AXIS" | "KOTAK" | "UPI_NPCI";

export interface BankHealth {
  bank: BankCode;
  status: "healthy" | "degraded" | "down";
  successRate: number; // rolling 30-min success rate, 0..1
  affectedMethods: string[];
  /** null when healthy; otherwise the feed's estimate of when it clears */
  estimatedRecoveryMinutes: number | null;
  note: string;
}

const FEED: Record<BankCode, BankHealth> = {
  HDFC: {
    bank: "HDFC",
    status: "degraded",
    successRate: 0.41,
    affectedMethods: ["upi", "netbanking"],
    estimatedRecoveryMinutes: 105,
    note: "NPCI reporting elevated failure rates on HDFC UPI handles since 14:20 IST. Card rails unaffected.",
  },
  SBI: {
    bank: "SBI",
    status: "healthy",
    successRate: 0.94,
    affectedMethods: [],
    estimatedRecoveryMinutes: null,
    note: "Operating normally.",
  },
  ICICI: {
    bank: "ICICI",
    status: "healthy",
    successRate: 0.96,
    affectedMethods: [],
    estimatedRecoveryMinutes: null,
    note: "Operating normally.",
  },
  AXIS: {
    bank: "AXIS",
    status: "healthy",
    successRate: 0.95,
    affectedMethods: [],
    estimatedRecoveryMinutes: null,
    note: "Operating normally.",
  },
  KOTAK: {
    bank: "KOTAK",
    status: "down",
    successRate: 0.08,
    affectedMethods: ["netbanking"],
    estimatedRecoveryMinutes: 240,
    note: "Scheduled core-banking maintenance window. Netbanking unavailable; UPI and cards routing normally.",
  },
  UPI_NPCI: {
    bank: "UPI_NPCI",
    status: "healthy",
    successRate: 0.93,
    affectedMethods: [],
    estimatedRecoveryMinutes: null,
    note: "NPCI switch operating normally.",
  },
};

export function getBankHealth(bank: string): BankHealth {
  const key = bank?.toUpperCase() as BankCode;
  return (
    FEED[key] ?? {
      bank: key,
      status: "healthy",
      successRate: 0.92,
      affectedMethods: [],
      estimatedRecoveryMinutes: null,
      note: "No downtime reported for this issuer.",
    }
  );
}

export function allBankHealth(): BankHealth[] {
  return Object.values(FEED);
}
