import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { SYSTEM_PROMPT, buildCaseBrief } from "./prompt";
import { TOOL_DECLARATIONS, runAndLog, type ToolContext } from "./tools";
import {
  createCase,
  getCase,
  getCaseByPayment,
  getCustomer,
  getPayment,
  logAction,
  updateCase,
} from "../queries";

/**
 * The agent loop.
 *
 * Kept deliberately thin and provider-shaped: the model proposes tool calls, we execute
 * them against real state, feed the results back, and repeat until it stops calling tools
 * and returns its decision. Everything it does along the way is written to agent_actions,
 * which is what the case timeline in the UI renders.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const MAX_TURNS = 8;

export interface AgentDecision {
  caseId: string;
  diagnosis: string;
  strategy: string;
  reasoning: string;
  confidence: number;
  expectedRecoveryNote?: string;
}

function parseDecision(text: string): Partial<AgentDecision> {
  // Models commonly wrap JSON in a fenced block; tolerate both shapes.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return {
      diagnosis: parsed.diagnosis,
      strategy: parsed.strategy,
      reasoning: parsed.reasoning,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      expectedRecoveryNote: parsed.expected_recovery_note,
    };
  } catch {
    return {};
  }
}

export async function runAgentOnPayment(paymentId: string): Promise<AgentDecision> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set — add it to .env.local");

  const payment = getPayment(paymentId);
  if (!payment) throw new Error(`No such payment: ${paymentId}`);
  const customer = getCustomer(payment.customer_id);
  if (!customer) throw new Error(`No customer for payment ${paymentId}`);

  const existing = getCaseByPayment(paymentId);
  const kase = existing ?? createCase(paymentId);
  const ctx: ToolContext = { caseId: kase.id, payment, customer };

  updateCase(kase.id, { status: "working" });

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: buildCaseBrief({
            paymentId: payment.id,
            amountPaise: payment.amount_paise,
            method: payment.method,
            bank: payment.bank,
            description: payment.description,
            isRecurring: Boolean(payment.is_recurring),
            errorReason: payment.error_reason,
            errorSource: payment.error_source,
            errorStep: payment.error_step,
            errorDescription: payment.error_description,
            failedAt: payment.failed_at,
          }),
        },
      ],
    },
  ];

  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        temperature: 0.2,
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const calls = response.functionCalls ?? [];

    // Any prose the model emits alongside its tool calls is its visible reasoning.
    const narration = parts
      .map((p) => p.text)
      .filter((t): t is string => Boolean(t && t.trim()))
      .join("\n")
      .trim();

    if (narration && calls.length) {
      logAction({ case_id: kase.id, kind: "thinking", text: narration });
    }

    if (!calls.length) {
      finalText = narration || response.text || "";
      break;
    }

    contents.push({ role: "model", parts: parts as Part[] });

    const resultParts: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = (call.args ?? {}) as Record<string, unknown>;
      const result = await runAndLog(name, args, ctx);
      resultParts.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "user", parts: resultParts });
  }

  const decision = parseDecision(finalText);
  const strategy = decision.strategy ?? "RETRY_SAME";

  logAction({
    case_id: kase.id,
    kind: "conclusion",
    text: finalText,
  });

  const current = getCase(kase.id);
  updateCase(kase.id, {
    diagnosis: decision.diagnosis ?? null,
    strategy,
    reasoning: decision.reasoning ?? null,
    confidence: decision.confidence ?? null,
    // mark_uncollectible already set a terminal status; don't overwrite it.
    status: current?.status === "uncollectible" ? "uncollectible" : (current?.status ?? "working"),
  });

  return {
    caseId: kase.id,
    diagnosis: decision.diagnosis ?? "",
    strategy,
    reasoning: decision.reasoning ?? "",
    confidence: decision.confidence ?? 0,
    expectedRecoveryNote: decision.expectedRecoveryNote,
  };
}
