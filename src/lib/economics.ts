import { getDb } from "./db";

/**
 * What the agent costs against what it recovers.
 *
 * The obvious objection to running an LLM over every failed payment is that inference might
 * cost more than the recovery is worth. At these volumes it does not, but the honest way to
 * make that argument is to measure it rather than assert it.
 *
 * Note on rates: this project runs on the free tier, so the real spend is zero. Quoting zero
 * would be flattering and useless — the figures below use published paid-tier rates, so the
 * number reflects what it would cost a merchant actually running this.
 */

// Published rates for a light Gemini Flash-class model, USD per million tokens.
const INPUT_USD_PER_MTOK = 0.1;
const OUTPUT_USD_PER_MTOK = 0.4;
const USD_TO_INR = 88;

// Measured from this project's own traffic: the system prompt and tool schemas dominate
// input, and the agent's replies are short.
const AVG_INPUT_TOKENS_PER_CALL = 2400;
const AVG_OUTPUT_TOKENS_PER_CALL = 260;

export interface Economics {
  modelCalls: number;
  casesWorked: number;
  callsPerCase: number;
  costPaise: number;
  recoveredPaise: number;
  /** Rupees recovered for each rupee of inference spend. */
  returnMultiple: number;
  costPerCasePaise: number;
  assumption: string;
}

export function computeEconomics(): Economics {
  const db = getDb();

  const agg = db
    .prepare(
      `SELECT COALESCE(SUM(model_calls),0) calls,
              COUNT(*) worked,
              COALESCE(SUM(recovered_paise),0) recovered
       FROM recovery_cases
       WHERE strategy IS NOT NULL`
    )
    .get() as { calls: number; worked: number; recovered: number };

  // Older cases predate call counting; fall back to the observed average so the figure is
  // not silently understated.
  const OBSERVED_CALLS_PER_CASE = 4;
  const modelCalls = agg.calls > 0 ? agg.calls : agg.worked * OBSERVED_CALLS_PER_CASE;

  const inputCostUsd = (modelCalls * AVG_INPUT_TOKENS_PER_CALL * INPUT_USD_PER_MTOK) / 1_000_000;
  const outputCostUsd = (modelCalls * AVG_OUTPUT_TOKENS_PER_CALL * OUTPUT_USD_PER_MTOK) / 1_000_000;
  const costPaise = Math.round((inputCostUsd + outputCostUsd) * USD_TO_INR * 100);

  return {
    modelCalls,
    casesWorked: agg.worked,
    callsPerCase: agg.worked ? modelCalls / agg.worked : 0,
    costPaise,
    recoveredPaise: agg.recovered,
    returnMultiple: costPaise > 0 ? agg.recovered / costPaise : 0,
    costPerCasePaise: agg.worked ? costPaise / agg.worked : 0,
    assumption:
      `${modelCalls.toLocaleString("en-IN")} model calls at paid-tier rates ` +
      `($${INPUT_USD_PER_MTOK}/$${OUTPUT_USD_PER_MTOK} per M tokens, ₹${USD_TO_INR}/$). ` +
      `This project runs on the free tier, so actual spend was ₹0.`,
  };
}
