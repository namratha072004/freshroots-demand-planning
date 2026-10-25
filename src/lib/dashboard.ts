import { getSql } from "./db";
import type { Metrics } from "./rules";

export interface FlagRow {
  id: number;
  skuId: string;
  skuName: string;
  category: string;
  flags: string[];
  action: "ORDER_NOW" | "PAUSE_ORDER" | "NEEDS_RAGHAV";
  quantity: number | null;
  reviewRequired: boolean;
  needsRaghavReason: string | null;
  metrics: Metrics;
  dataIssues: string[];
  reason: string | null;
  aiNeedsRaghav: boolean | null;
  aiTriageReason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
}

export interface DashboardData {
  run: { id: number; asOf: string; finishedAt: string; trigger: string; festivalMonth: boolean; aiStatus: string | null; aiError: string | null } | null;
  rows: FlagRow[];
  pendingCount: number;
}

const ORDER: Record<string, number> = { ORDER_NOW: 0, PAUSE_ORDER: 1, NEEDS_RAGHAV: 2 };

export async function getDashboardData(): Promise<DashboardData> {
  const sql = getSql();
  const runs = await sql`SELECT id, to_char(asof_date, 'YYYY-MM-DD') AS asof, finished_at, trigger, festival_month, ai_status, ai_error
    FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`;
  if (runs.length === 0) return { run: null, rows: [], pendingCount: 0 };
  const run = runs[0];

  const recs = await sql`SELECT r.id, r.sku_id, coalesce(m.sku_name, r.sku_id) AS sku_name, coalesce(m.category, '') AS category,
      r.flags, r.action, r.quantity, r.review_required, r.needs_raghav_reason, r.metrics, r.data_issues,
      r.reason, r.ai_needs_raghav, r.ai_triage_reason, r.status, r.rejection_reason
    FROM recommendations r LEFT JOIN sku_master m ON m.sku_id = r.sku_id
    WHERE r.run_id = ${run.id} AND r.status <> 'SUPERSEDED'`;

  const rows: FlagRow[] = recs
    .map((r) => ({
      id: Number(r.id),
      skuId: r.sku_id as string,
      skuName: r.sku_name as string,
      category: r.category as string,
      flags: r.flags as string[],
      action: r.action as FlagRow["action"],
      quantity: r.quantity as number | null,
      reviewRequired: r.review_required as boolean,
      needsRaghavReason: r.needs_raghav_reason as string | null,
      metrics: r.metrics as Metrics,
      dataIssues: r.data_issues as string[],
      reason: r.reason as string | null,
      aiNeedsRaghav: r.ai_needs_raghav as boolean | null,
      aiTriageReason: r.ai_triage_reason as string | null,
      status: r.status as FlagRow["status"],
      rejectionReason: r.rejection_reason as string | null,
    }))
    .sort((a, b) => ORDER[a.action] - ORDER[b.action] || a.skuId.localeCompare(b.skuId));

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM recommendations WHERE status = 'PENDING' AND action <> 'NEEDS_RAGHAV'`;
  return {
    run: {
      id: Number(run.id),
      asOf: run.asof as string,
      finishedAt: new Date(run.finished_at as string).toISOString(),
      trigger: run.trigger as string,
      festivalMonth: run.festival_month as boolean,
      aiStatus: run.ai_status as string | null,
      aiError: run.ai_error as string | null,
    },
    rows,
    pendingCount: n as number,
  };
}
