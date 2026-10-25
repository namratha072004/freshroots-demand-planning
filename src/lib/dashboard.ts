import { getSql } from "./db";
import type { Metrics } from "./rules";

export interface FlagRow {
  id: number;
  /** The run this flag came from (older decisions can be from earlier runs). */
  runId: number;
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
  /** Units sold per week, oldest first, for the sparkline (the same series the rules used). */
  weekly: { week: string; units: number }[];
  aiNeedsRaghav: boolean | null;
  aiTriageReason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  decidedAt: string | null;
}

export interface DashboardData {
  run: { id: number; asOf: string; finishedAt: string; trigger: string; festivalMonth: boolean; aiStatus: string | null; aiError: string | null } | null;
  /** The latest run's flags (SUPERSEDED ones excluded). */
  rows: FlagRow[];
  /** Approved and rejected decisions across runs since the kill-switch window started: what the rejection rate counts. */
  decided: FlagRow[];
  pendingCount: number;
}

const ORDER: Record<string, number> = { ORDER_NOW: 0, PAUSE_ORDER: 1, NEEDS_RAGHAV: 2 };

type Rec = Record<string, unknown>;

function toRows(recs: Rec[]): FlagRow[] {
  return recs.map((r) => ({
    id: Number(r.id),
    runId: Number(r.run_id),
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
    weekly: [],
    aiNeedsRaghav: r.ai_needs_raghav as boolean | null,
    aiTriageReason: r.ai_triage_reason as string | null,
    status: r.status as FlagRow["status"],
    rejectionReason: r.rejection_reason as string | null,
    decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null,
  }));
}

async function attachWeekly(rows: FlagRow[]): Promise<void> {
  if (rows.length === 0) return;
  const weekly = await getSql()`SELECT sku_id, week, units_sold FROM weekly_sales
    WHERE sku_id = ANY(${[...new Set(rows.map((r) => r.skuId))]}::text[]) ORDER BY sku_id, week`;
  for (const r of rows) r.weekly = weekly.filter((w) => w.sku_id === r.skuId).map((w) => ({ week: w.week as string, units: w.units_sold as number }));
}

/** `windowStart`: decisions made before this moment are not part of the rejection rate (kill-switch window / last resume). */
export async function getDashboardData(windowStart: Date): Promise<DashboardData> {
  const sql = getSql();
  const runs = await sql`SELECT id, to_char(asof_date, 'YYYY-MM-DD') AS asof, finished_at, trigger, festival_month, ai_status, ai_error
    FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`;

  const [recs, decidedRecs, pending] = await Promise.all([
    runs.length === 0
      ? Promise.resolve([] as Rec[])
      : sql`SELECT r.id, r.run_id, r.sku_id, coalesce(m.sku_name, r.sku_id) AS sku_name, coalesce(m.category, '') AS category,
          r.flags, r.action, r.quantity, r.review_required, r.needs_raghav_reason, r.metrics, r.data_issues,
          r.reason, r.ai_needs_raghav, r.ai_triage_reason, r.status, r.rejection_reason, r.decided_at
        FROM recommendations r LEFT JOIN sku_master m ON m.sku_id = r.sku_id
        WHERE r.run_id = ${runs[0].id} AND r.status <> 'SUPERSEDED'`,
    sql`SELECT r.id, r.run_id, r.sku_id, coalesce(m.sku_name, r.sku_id) AS sku_name, coalesce(m.category, '') AS category,
          r.flags, r.action, r.quantity, r.review_required, r.needs_raghav_reason, r.metrics, r.data_issues,
          r.reason, r.ai_needs_raghav, r.ai_triage_reason, r.status, r.rejection_reason, r.decided_at
        FROM recommendations r LEFT JOIN sku_master m ON m.sku_id = r.sku_id
        WHERE r.status IN ('APPROVED', 'REJECTED') AND r.action <> 'NEEDS_RAGHAV' AND r.decided_at >= ${windowStart.toISOString()}
        ORDER BY r.decided_at DESC`,
    sql`SELECT count(*)::int AS n FROM recommendations WHERE status = 'PENDING' AND action <> 'NEEDS_RAGHAV'`,
  ]);

  const rows = toRows(recs).sort((a, b) => ORDER[a.action] - ORDER[b.action] || a.skuId.localeCompare(b.skuId));
  const decided = toRows(decidedRecs);
  await Promise.all([attachWeekly(rows), attachWeekly(decided)]);

  const run = runs[0];
  return {
    run: run
      ? {
          id: Number(run.id),
          asOf: run.asof as string,
          finishedAt: new Date(run.finished_at as string).toISOString(),
          trigger: run.trigger as string,
          festivalMonth: run.festival_month as boolean,
          aiStatus: run.ai_status as string | null,
          aiError: run.ai_error as string | null,
        }
      : null,
    rows,
    decided,
    pendingCount: pending[0].n as number,
  };
}
