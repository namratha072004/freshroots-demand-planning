import { z } from "zod";
import type { GenerateJson } from "../gemini";
import { allowedNumbersFor, factsFor, type AiRec } from "./facts";
import { disallowedNumbers } from "./numberGuard";
import { REASONS_JSON_SCHEMA, ReasonSchema, TRIAGE_JSON_SCHEMA, TriageSchema } from "./schemas";

export interface AiResult {
  reasons: Map<string, string>;
  /** reason is null when the model's sentence was dropped by the number check; the signal is kept. */
  triage: Map<string, { needsRaghav: boolean; reason: string | null }>;
  /** Problems that did not stop the step (one failed call, a dropped reason). */
  errors: string[];
}

const CALL_TIMEOUT_MS = 20_000;
const MIN_RETRY_BUDGET_MS = 15_000;
const TRANSIENT = /timeout|timed out|aborted|HTTP (429|5\d\d)|fetch failed/i;

const RULES_FOR_MODEL = `You are helping a demand planner. All numbers were already calculated by deterministic code and are given in FACTS.
- Use ONLY numbers that appear in FACTS, copied exactly as written. Never round, convert, add, subtract or work out a new number.
- Do not change, question or add to the action or quantity. Do not recommend anything other than the given action.
- Write plain English, one sentence, at most 35 words. Write numbers as digits.`;

function reasonsPrompt(recs: AiRec[], extra = ""): string {
  return `${RULES_FOR_MODEL}

Task: for each SKU, write one sentence saying why it was flagged: the flag, the key number(s), and the action given.
Mention the festival uplift if festival_uplift_applied is true, and the tighter window if the SKU is High perishability.
If the rules could not decide, explain that in the same plain way using rules_could_not_decide_because.
Example: "SKU004 has 1.8 weeks of stock after the festival adjustment, below the 3-week minimum for perishable SKUs, so reorder now."
${extra}
Return a JSON array with exactly one { "sku_id", "reason" } per SKU.

FACTS:
${JSON.stringify(recs.map(factsFor))}`;
}

function triagePrompt(recs: AiRec[]): string {
  return `${RULES_FOR_MODEL}

Task: decide for each SKU whether the senior planner should look at it personally because the recent sales pattern may be a one-off or otherwise unusual
(for example a spike that fell back toward the usual level, a sudden drop, very erratic weeks, or data problems). Use weekly_sales_oldest_to_newest to judge the shape.
You do NOT decide any order. Set needs_raghav to true only when the pattern looks unusual; otherwise false with a short reason.
Example: { "sku_id": "SKU0XX", "needs_raghav": true, "reason": "Sales spiked then fell back, which may be a one-off event." }
Return a JSON array with exactly one { "sku_id", "needs_raghav", "reason" } per SKU.

FACTS:
${JSON.stringify(recs.map(factsFor))}`;
}

function parseArray<T>(raw: unknown, schema: z.ZodType<T>, known: Set<string>, errors: string[], label: string): Map<string, T> {
  const out = new Map<string, T>();
  if (!Array.isArray(raw)) {
    errors.push(`${label}: response was not a JSON array`);
    return out;
  }
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      errors.push(`${label}: an item failed validation`);
      continue;
    }
    const id = (parsed.data as { sku_id: string }).sku_id;
    if (!known.has(id)) continue; // the model invented a SKU: ignore
    if (!out.has(id)) out.set(id, parsed.data);
  }
  return out;
}

/** Keep only reasons whose numbers all come from the facts. Returns the kept ones and the SKUs that failed. */
function guardNumbers(recs: AiRec[], text: Map<string, string>, errors: string[], label: string) {
  const kept = new Map<string, string>();
  const failed: { rec: AiRec; bad: string[] }[] = [];
  for (const r of recs) {
    const t = text.get(r.skuId);
    if (t === undefined) continue;
    const bad = disallowedNumbers(t, allowedNumbersFor(r));
    if (bad.length === 0) kept.set(r.skuId, t);
    else failed.push({ rec: r, bad });
  }
  if (failed.length) errors.push(`${label}: dropped text with numbers not in the data for ${failed.map((f) => f.rec.skuId).join(", ")}`);
  return { kept, failed };
}

/**
 * Reasons and triage from the model. Never throws: any failure just leaves reasons/triage out.
 * The model only writes text; every number it may quote came from deterministic code and is checked.
 */
export async function generateAi(recs: AiRec[], generate: GenerateJson, deadline: number): Promise<AiResult> {
  const result: AiResult = { reasons: new Map(), triage: new Map(), errors: [] };
  if (recs.length === 0) return result;
  const known = new Set(recs.map((r) => r.skuId));
  const budget = () => Math.max(1_000, Math.min(CALL_TIMEOUT_MS, deadline - Date.now()));
  // One retry for temporary failures (timeout, 429, 5xx) while there is time left.
  const call = async (prompt: string, schema: object): Promise<unknown> => {
    try {
      return await generate({ prompt, schema, timeoutMs: budget() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!TRANSIENT.test(msg) || deadline - Date.now() < 5_000) throw e;
      return generate({ prompt, schema, timeoutMs: budget() });
    }
  };

  const [reasonsCall, triageCall] = await Promise.allSettled([
    call(reasonsPrompt(recs), REASONS_JSON_SCHEMA),
    call(triagePrompt(recs), TRIAGE_JSON_SCHEMA),
  ]);

  if (reasonsCall.status === "fulfilled") {
    const parsed = parseArray(reasonsCall.value, ReasonSchema, known, result.errors, "reasons");
    const text = new Map([...parsed].map(([id, v]) => [id, v.reason]));
    const { kept, failed } = guardNumbers(recs, text, result.errors, "reasons");
    kept.forEach((v, k) => result.reasons.set(k, v));

    // One retry for reasons that quoted numbers outside the data, if there is time left.
    if (failed.length && deadline - Date.now() > MIN_RETRY_BUDGET_MS) {
      const bads = failed.map((f) => `${f.rec.skuId}: do not use ${f.bad.join(", ")}`).join("; ");
      try {
        const retryRecs = failed.map((f) => f.rec);
        const raw = await generate({
          prompt: reasonsPrompt(retryRecs, `Your previous answer used numbers that are not in FACTS (${bads}). Use only numbers from FACTS, exactly as written.`),
          schema: REASONS_JSON_SCHEMA,
          timeoutMs: budget(),
        });
        const again = parseArray(raw, ReasonSchema, new Set(retryRecs.map((r) => r.skuId)), result.errors, "reasons retry");
        const { kept: ok } = guardNumbers(retryRecs, new Map([...again].map(([id, v]) => [id, v.reason])), result.errors, "reasons retry");
        ok.forEach((v, k) => result.reasons.set(k, v));
      } catch (e) {
        result.errors.push(`reasons retry: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    result.errors.push(`reasons: ${reasonsCall.reason instanceof Error ? reasonsCall.reason.message : String(reasonsCall.reason)}`);
  }

  if (triageCall.status === "fulfilled") {
    const parsed = parseArray(triageCall.value, TriageSchema, known, result.errors, "triage");
    const { kept } = guardNumbers(recs, new Map([...parsed].map(([id, v]) => [id, v.reason])), result.errors, "triage");
    for (const [id, item] of parsed) result.triage.set(id, { needsRaghav: item.needs_raghav, reason: kept.get(id) ?? null });
  } else {
    result.errors.push(`triage: ${triageCall.reason instanceof Error ? triageCall.reason.message : String(triageCall.reason)}`);
  }
  return result;
}
