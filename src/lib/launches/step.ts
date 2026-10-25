import { config } from "@/config";
import { getSql } from "../db";
import { geminiSearch } from "../gemini";
import { collectLeads, type LeadDeps, type LeadStats } from "./collect";
import { fetchSource } from "./fetchSource";

export type LaunchStatus = "ok" | "partial" | "failed" | "skipped";
export interface LaunchStepSummary {
  status: LaunchStatus;
  kept: number;
  stats: LeadStats | null;
  error: string | null;
}

/**
 * Which categories to search this run: only categories in sku_master, deduplicated, capped at the search cap.
 * With more categories than the cap allows, the start rotates so every category comes up over successive runs.
 */
export function pickCategories(all: string[], runId: number, cap: number): string[] {
  const sorted = [...new Set(all)].sort();
  if (sorted.length <= cap) return sorted;
  const start = (((runId - 1) * cap) % sorted.length + sorted.length) % sorted.length;
  return Array.from({ length: cap }, (_, i) => sorted[(start + i) % sorted.length]);
}

/**
 * Builds sourced new-launch leads for the run. Never throws and never touches flags: any failure only
 * means fewer or no leads.
 */
export async function runLaunchStep(
  runId: number,
  deps: LeadDeps = {
    search: (prompt, timeoutMs) => geminiSearch({ prompt, timeoutMs }),
    fetchSource: (uri) => fetchSource(uri),
    now: new Date(),
  },
): Promise<LaunchStepSummary> {
  const sql = getSql();
  const finish = async (s: LaunchStepSummary) => {
    try {
      await sql`UPDATE runs SET launch_status = ${s.status}, launch_error = ${s.error}, launch_stats = ${s.stats ? JSON.stringify(s.stats) : null}::jsonb WHERE id = ${runId}`;
    } catch {
      // Recording the status is best effort.
    }
    return s;
  };

  try {
    if (!process.env.GEMINI_API_KEY?.trim() || !process.env.GEMINI_MODEL?.trim()) {
      return await finish({ status: "skipped", kept: 0, stats: null, error: "GEMINI_API_KEY or GEMINI_MODEL is not set" });
    }
    const cats = (await sql`SELECT DISTINCT category FROM sku_master ORDER BY category`).map((r) => r.category as string);
    const categories = pickCategories(cats, runId, config.launches.maxSearchesPerRun);
    if (categories.length === 0) return await finish({ status: "ok", kept: 0, stats: null, error: null });

    const { leads, stats } = await collectLeads(categories, deps, Date.now() + config.launches.searchPhaseMs + config.launches.pageFetchPhaseMs + 2_000);

    if (leads.length) {
      await sql`INSERT INTO launch_leads (run_id, category, title, summary, source_url, grounding_uri, source_site, source_date)
        SELECT ${runId}::bigint, x.category, x.title, x.summary, x.source_url, x.grounding_uri, x.source_site, x.source_date
        FROM jsonb_to_recordset(${JSON.stringify(leads)}::jsonb) AS x(
          title text, category text, source_url text, source_date date, summary text, grounding_uri text, source_site text)
        WHERE NOT EXISTS (
          SELECT 1 FROM launch_leads e
          WHERE e.category = x.category
            AND regexp_replace(lower(e.title), '[^a-z0-9]', '', 'g') = regexp_replace(lower(x.title), '[^a-z0-9]', '', 'g'))
        ON CONFLICT (lower(source_url)) DO NOTHING`;
    }

    const status: LaunchStatus = stats.searchesFailed === 0 ? "ok" : stats.searchesFailed >= stats.searches ? "failed" : "partial";
    return await finish({ status, kept: leads.length, stats, error: stats.errors.length ? stats.errors.join(" | ").slice(0, 1000) : null });
  } catch (e) {
    return await finish({ status: "failed", kept: 0, stats: null, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
  }
}
