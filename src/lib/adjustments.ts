import { ADJUSTMENT_REASONS } from "./adjustmentReasons";
import { getSql } from "./db";
import { describeDelta } from "./quantity";

/** One order where the planner's quantity differs from what the rules suggested. */
export interface AdjustmentRow {
  recommendationId: number;
  skuId: string;
  skuName: string;
  category: string;
  runId: number;
  suggested: number;
  chosen: number;
  deltaUnits: number;
  deltaPercent: number;
  reason: string | null;
  note: string | null;
  changes: number;
  lastChangedAt: string;
  status: string;
  inPo: boolean;
}

export interface SkuRollup {
  skuId: string;
  skuName: string;
  count: number;
  averagePercent: number;
  netUnits: number;
}

export interface AdjustmentStats {
  adjusted: number;
  /** Average of the signed differences. Rises and cuts cancel out, so it can look small. */
  averagePercent: number;
  /** Average SIZE of the differences, ignoring direction: how far the planner typically moves from the suggestion. */
  averageSizePercent: number;
  netUnits: number;
  lowered: number;
  raised: number;
  byReason: Record<string, number>;
  topReason: string | null;
  bySku: SkuRollup[];
}

/** Summary of the differences between the system's suggestions and the planner's numbers. Pure. */
export function adjustmentStats(rows: AdjustmentRow[]): AdjustmentStats {
  const byReason: Record<string, number> = {};
  const sku = new Map<string, { name: string; pct: number[]; units: number }>();
  for (const r of rows) {
    if (r.reason) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    const e = sku.get(r.skuId) ?? { name: r.skuName, pct: [], units: 0 };
    e.pct.push(r.deltaPercent);
    e.units += r.deltaUnits;
    sku.set(r.skuId, e);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  const top = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
  return {
    adjusted: rows.length,
    averagePercent: avg(rows.map((r) => r.deltaPercent)),
    averageSizePercent: avg(rows.map((r) => Math.abs(r.deltaPercent))),
    netUnits: rows.reduce((s, r) => s + r.deltaUnits, 0),
    lowered: rows.filter((r) => r.deltaUnits < 0).length,
    raised: rows.filter((r) => r.deltaUnits > 0).length,
    byReason: Object.fromEntries(ADJUSTMENT_REASONS.map((k) => [k, byReason[k] ?? 0])),
    topReason: top ? top[0] : null,
    bySku: [...sku.entries()]
      .map(([skuId, v]) => ({ skuId, skuName: v.name, count: v.pct.length, averagePercent: avg(v.pct), netUnits: v.units }))
      .sort((a, b) => b.count - a.count || Math.abs(b.netUnits) - Math.abs(a.netUnits)),
  };
}

export async function listAdjustments(): Promise<{ rows: AdjustmentRow[]; agreed: number; approvedOrders: number }> {
  const sql = getSql();
  const [rows, counts] = await Promise.all([
    sql`SELECT r.id, r.sku_id, coalesce(m.sku_name, r.sku_id) AS sku_name, coalesce(m.category, '') AS category, r.run_id,
          r.quantity AS suggested, r.approved_quantity AS chosen, r.adjustment_reason, r.adjustment_note, r.status, r.draft_po_id,
          (SELECT count(*)::int FROM quantity_audit a WHERE a.recommendation_id = r.id) AS changes,
          coalesce((SELECT max(a.changed_at) FROM quantity_audit a WHERE a.recommendation_id = r.id), r.decided_at) AS last_changed
        FROM recommendations r LEFT JOIN sku_master m ON m.sku_id = r.sku_id
        WHERE r.approved_quantity IS NOT NULL AND r.action = 'ORDER_NOW'
        ORDER BY last_changed DESC`,
    sql`SELECT count(*) FILTER (WHERE status = 'APPROVED' AND action = 'ORDER_NOW')::int AS approved_orders,
               count(*) FILTER (WHERE status = 'APPROVED' AND action = 'ORDER_NOW' AND approved_quantity IS NULL)::int AS agreed
        FROM recommendations`,
  ]);
  return {
    rows: rows.map((r) => {
      const d = describeDelta(r.suggested as number, r.chosen as number);
      return {
        recommendationId: Number(r.id),
        skuId: r.sku_id as string,
        skuName: r.sku_name as string,
        category: r.category as string,
        runId: Number(r.run_id),
        suggested: r.suggested as number,
        chosen: r.chosen as number,
        deltaUnits: d.units,
        deltaPercent: d.percent,
        reason: r.adjustment_reason as string | null,
        note: r.adjustment_note as string | null,
        changes: r.changes as number,
        lastChangedAt: new Date(r.last_changed as string).toISOString(),
        status: r.status as string,
        inPo: r.draft_po_id !== null,
      };
    }),
    agreed: counts[0].agreed as number,
    approvedOrders: counts[0].approved_orders as number,
  };
}
