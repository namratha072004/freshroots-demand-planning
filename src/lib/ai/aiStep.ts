import { getSql } from "../db";
import { geminiGenerateJson, type GenerateJson } from "../gemini";
import type { Metrics } from "../rules";
import { loadSettings } from "../settings";
import { generateAi } from "./enrich";
import type { AiRec } from "./facts";

export type AiStatus = "ok" | "partial" | "failed" | "skipped";
export interface AiStepSummary {
  status: AiStatus;
  reasons: number;
  triaged: number;
  error: string | null;
}

const AI_BUDGET_MS = 45_000;

/**
 * Adds reasons and triage to the run's saved flags. Never throws and never changes a flag, action or quantity:
 * if anything fails, the flags simply stay without reasons.
 */
export async function runAiStep(runId: number, generate: GenerateJson = geminiGenerateJson): Promise<AiStepSummary> {
  const sql = getSql();
  const finish = async (s: AiStepSummary) => {
    try {
      await sql`UPDATE runs SET ai_status = ${s.status}, ai_error = ${s.error} WHERE id = ${runId}`;
    } catch {
      // Recording the status is best effort.
    }
    return s;
  };

  try {
    if (!process.env.GEMINI_API_KEY?.trim() || !process.env.GEMINI_MODEL?.trim()) {
      return await finish({ status: "skipped", reasons: 0, triaged: 0, error: "GEMINI_API_KEY or GEMINI_MODEL is not set" });
    }

    const rows = await sql`SELECT r.id, r.sku_id, coalesce(m.sku_name, r.sku_id) AS sku_name, coalesce(m.category, '') AS category,
        coalesce(d.perishability, 'Low') AS perishability, r.action, r.quantity, r.flags, r.metrics, d.units_on_hand,
        r.needs_raghav_reason, r.data_issues
      FROM recommendations r
      LEFT JOIN sku_master m ON m.sku_id = r.sku_id
      LEFT JOIN run_sku_data d ON d.run_id = r.run_id AND d.sku_id = r.sku_id
      WHERE r.run_id = ${runId} ORDER BY r.sku_id`;
    if (rows.length === 0) return await finish({ status: "ok", reasons: 0, triaged: 0, error: null });

    const sales = await sql`SELECT sku_id, units_sold FROM weekly_sales
      WHERE sku_id = ANY(${rows.map((r) => r.sku_id as string)}::text[]) ORDER BY sku_id, week`;

    const recs: AiRec[] = rows.map((r) => ({
      id: Number(r.id),
      skuId: r.sku_id as string,
      skuName: r.sku_name as string,
      category: r.category as string,
      perishability: r.perishability as string,
      action: r.action as string,
      quantity: r.quantity as number | null,
      flags: r.flags as string[],
      metrics: r.metrics as Metrics,
      unitsOnHand: r.units_on_hand as number | null,
      needsRaghavReason: r.needs_raghav_reason as string | null,
      dataIssues: r.data_issues as string[],
      weeklySales: sales.filter((s) => s.sku_id === r.sku_id).map((s) => s.units_sold as number),
    }));

    const { rules } = await loadSettings();
    const ai = await generateAi(recs, generate, Date.now() + AI_BUDGET_MS, rules);

    const updates = recs
      .filter((r) => ai.reasons.has(r.skuId) || ai.triage.has(r.skuId))
      .map((r) => ({
        id: r.id,
        reason: ai.reasons.get(r.skuId) ?? null,
        ai_needs_raghav: ai.triage.get(r.skuId)?.needsRaghav ?? null,
        ai_triage_reason: ai.triage.get(r.skuId)?.reason ?? null,
      }));
    if (updates.length) {
      await sql`UPDATE recommendations r SET reason = x.reason, ai_needs_raghav = x.ai_needs_raghav, ai_triage_reason = x.ai_triage_reason
        FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(id bigint, reason text, ai_needs_raghav boolean, ai_triage_reason text)
        WHERE r.id = x.id AND r.run_id = ${runId}`;
    }

    const complete = ai.reasons.size === recs.length && ai.triage.size === recs.length;
    // A dropped triage sentence (signal kept) is noted in ai_error but does not make the run "partial".
    const status: AiStatus = complete ? "ok" : ai.reasons.size === 0 && ai.triage.size === 0 ? "failed" : "partial";
    return await finish({
      status,
      reasons: ai.reasons.size,
      triaged: ai.triage.size,
      error: ai.errors.length ? ai.errors.join(" | ").slice(0, 1000) : null,
    });
  } catch (e) {
    return await finish({ status: "failed", reasons: 0, triaged: 0, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
  }
}
