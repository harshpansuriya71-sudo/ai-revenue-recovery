import { Type, type FunctionDeclaration } from "@google/genai";
import { getBankHealth } from "../bank-health";
import { createPaymentLink } from "../razorpay";
import {
  customerFailureHistory,
  getCustomer,
  getPayment,
  logAction,
  setPaymentStatus,
  updateCase,
  type CustomerRow,
  type PaymentRow,
} from "../queries";

/**
 * The agent's tool surface.
 *
 * Handlers do the real work and persist their effects, so the reasoning timeline in the UI
 * is a record of what actually happened rather than what the model said it would do.
 */

export interface ToolContext {
  caseId: string;
  payment: PaymentRow;
  customer: CustomerRow;
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_payment_context",
    description:
      "Fetch full context for the failed payment: amount, method, the Razorpay error signature, " +
      "and the customer's payment history with this merchant. Call this first, always.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        payment_id: { type: Type.STRING, description: "The failed payment's ID." },
      },
      required: ["payment_id"],
    },
  },
  {
    name: "check_bank_health",
    description:
      "Look up live downtime and rolling success rate for a bank or the UPI switch. Use this " +
      "before choosing a retry time whenever error_source is 'bank' or 'gateway'. Returns an " +
      "estimated recovery time when the issuer is degraded.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        bank_code: {
          type: Type.STRING,
          description: "Bank code: HDFC, SBI, ICICI, AXIS, KOTAK, or UPI_NPCI.",
        },
      },
      required: ["bank_code"],
    },
  },
  {
    name: "schedule_retry",
    description:
      "Queue a retry of this payment at a specific time, optionally on a different method. " +
      "You must justify the exact timing you chose.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        payment_id: { type: Type.STRING },
        retry_at: {
          type: Type.STRING,
          description: "ISO 8601 timestamp for the retry, e.g. 2026-09-04T11:30:00.000Z",
        },
        method: {
          type: Type.STRING,
          description: "Method to retry on: upi, card, netbanking or wallet.",
        },
        rationale: {
          type: Type.STRING,
          description: "Why this specific time and method. Be concrete about the cause.",
        },
      },
      required: ["payment_id", "retry_at", "method", "rationale"],
    },
  },
  {
    name: "create_payment_link",
    description:
      "Create a real Razorpay payment link for the outstanding amount and attach it to this " +
      "case. Use when the customer needs to act. Follow this with draft_nudge.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        payment_id: { type: Type.STRING },
        expiry_hours: {
          type: Type.NUMBER,
          description: "Hours until the link expires. Typically 24 to 72.",
        },
      },
      required: ["payment_id", "expiry_hours"],
    },
  },
  {
    name: "draft_nudge",
    description:
      "Save the customer-facing recovery message you have written. Write it yourself — be " +
      "brief, warm and specific, and never blame the customer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        channel: {
          type: Type.STRING,
          description: "Delivery channel: email, whatsapp or sms.",
        },
        subject: {
          type: Type.STRING,
          description: "Subject line, max 8 words. Use an empty string for sms/whatsapp.",
        },
        message: {
          type: Type.STRING,
          description: "The message body, ready to send. Include the payment link if one exists.",
        },
      },
      required: ["channel", "subject", "message"],
    },
  },
  {
    name: "mark_uncollectible",
    description:
      "Close the case without recovery. Use when the customer has revoked consent or when no " +
      "strategy has a realistic chance. This is a legitimate outcome — a wasted retry costs " +
      "money and annoys someone who already said no.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        payment_id: { type: Type.STRING },
        reason: { type: Type.STRING, description: "Why recovery is not worth pursuing." },
      },
      required: ["payment_id", "reason"],
    },
  },
];

type Args = Record<string, unknown>;

export async function executeTool(
  name: string,
  args: Args,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  switch (name) {
    case "get_payment_context": {
      const payment = getPayment(String(args.payment_id ?? ctx.payment.id)) ?? ctx.payment;
      const customer = getCustomer(payment.customer_id);
      const history = customerFailureHistory(payment.customer_id, payment.id);
      const attempts = history.length;
      return {
        payment: {
          id: payment.id,
          amount_rupees: payment.amount_paise / 100,
          amount_paise: payment.amount_paise,
          method: payment.method,
          bank: payment.bank,
          description: payment.description,
          is_recurring: Boolean(payment.is_recurring),
          error_reason: payment.error_reason,
          error_source: payment.error_source,
          error_step: payment.error_step,
          error_description: payment.error_description,
          failed_at: payment.failed_at,
        },
        customer: {
          name: customer?.name,
          email: customer?.email,
          phone: customer?.phone,
          successful_payments: customer?.prior_success_count ?? 0,
          failed_payments: customer?.prior_failure_count ?? 0,
          lifetime_value_rupees: (customer?.lifetime_value_paise ?? 0) / 100,
          customer_since: customer?.created_at,
        },
        other_recent_payments: history,
        assessment: {
          is_repeat_failure: attempts > 0,
          // A long clean record is the strongest argument for patience over pressure.
          history_quality:
            (customer?.prior_success_count ?? 0) >= 10
              ? "strong"
              : (customer?.prior_success_count ?? 0) >= 3
                ? "moderate"
                : "thin",
        },
      };
    }

    case "check_bank_health": {
      const health = getBankHealth(String(args.bank_code ?? ctx.payment.bank ?? ""));
      return {
        ...health,
        success_rate_pct: Math.round(health.successRate * 100),
        guidance:
          health.status === "healthy"
            ? "This issuer is fine. The failure is not infrastructure — look at the customer or the instrument."
            : `This issuer is ${health.status}. Schedule any retry AFTER the estimated recovery time (${health.estimatedRecoveryMinutes} minutes from now), or route to a healthy method.`,
      };
    }

    case "schedule_retry": {
      const retryAt = String(args.retry_at);
      const method = String(args.method);
      const parsed = new Date(retryAt).getTime();
      const hoursOut = (parsed - Date.now()) / 3600000;

      // Reject before persisting. A retry scheduled in the past never fires, and the model
      // will otherwise anchor to the payment's failure time rather than to now.
      if (Number.isNaN(parsed)) {
        return { scheduled: false, error: `retry_at "${retryAt}" is not a valid ISO 8601 timestamp.` };
      }
      if (hoursOut <= 0) {
        return {
          scheduled: false,
          error:
            `retry_at ${retryAt} is in the past. The current time is ${new Date().toISOString()}. ` +
            `Choose a time after that and call schedule_retry again.`,
        };
      }

      updateCase(ctx.caseId, {
        status: "scheduled",
        retry_at: retryAt,
        retry_method: method,
      });
      return {
        scheduled: true,
        retry_at: retryAt,
        method,
        hours_from_now: Math.round(hoursOut * 10) / 10,
        note: "Retry queued. The scheduler will re-attempt the charge at this time.",
      };
    }

    case "create_payment_link": {
      const link = await createPaymentLink({
        amountPaise: ctx.payment.amount_paise,
        description: ctx.payment.description,
        customerName: ctx.customer.name,
        customerEmail: ctx.customer.email,
        customerPhone: ctx.customer.phone,
        expiryHours: Number(args.expiry_hours ?? 48),
        referencePaymentId: ctx.payment.id,
      });
      updateCase(ctx.caseId, {
        payment_link_url: link.short_url,
        payment_link_id: link.id,
      });
      return {
        payment_link_url: link.short_url,
        payment_link_id: link.id,
        amount_rupees: ctx.payment.amount_paise / 100,
        simulated: link.simulated,
        ...(link.note ? { note: link.note } : {}),
      };
    }

    case "draft_nudge": {
      const channel = String(args.channel ?? "email");
      const subject = String(args.subject ?? "");
      const message = String(args.message ?? "");
      updateCase(ctx.caseId, {
        nudge_channel: channel,
        nudge_message: subject ? `${subject}\n\n${message}` : message,
      });
      return { saved: true, channel, characters: message.length };
    }

    case "mark_uncollectible": {
      const reason = String(args.reason ?? "");
      updateCase(ctx.caseId, {
        status: "uncollectible",
        resolved_at: new Date().toISOString(),
      });
      setPaymentStatus(ctx.payment.id, "uncollectible");
      return { closed: true, reason };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Runs a tool and records both the call and its result for the UI timeline. */
export async function runAndLog(name: string, args: Args, ctx: ToolContext) {
  let result: Record<string, unknown>;
  try {
    result = await executeTool(name, args, ctx);
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }
  logAction({
    case_id: ctx.caseId,
    kind: "tool_call",
    tool_name: name,
    tool_input: args,
    tool_result: result,
  });
  return result;
}
