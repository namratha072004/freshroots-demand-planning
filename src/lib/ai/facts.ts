import { config } from "@/config";
import type { Metrics } from "@/lib/rules";

export interface AiRec {
  id: number;
  skuId: string;
  skuName: string;
  category: string;
  perishability: string;
  action: string;
  quantity: number | null;
  flags: string[];
  metrics: Metrics;
  unitsOnHand: number | null;
  needsRaghavReason: string | null;
  dataIssues: string[];
  /** Units sold per week, oldest first (as calculated and stored by the rules step). */
  weeklySales: number[];
}

const n1 = (x: number | null) => (x === null ? null : x.toFixed(1));

/** The only numbers the model gets. Everything here was calculated by deterministic code. */
export function factsFor(r: AiRec, rules: { festivalUplift: number } = config.rules): Record<string, unknown> {
  const m = r.metrics;
  return {
    sku_id: r.skuId,
    name: r.skuName,
    category: r.category,
    perishability: r.perishability === "High" ? "High (tighter stock-cover window)" : "Low",
    flags: r.flags,
    action: r.action,
    order_quantity: r.quantity,
    stock_units_on_hand: r.unitsOnHand,
    stock_cover_weeks: n1(m.cover),
    cover_minimum_weeks: m.minCover,
    cover_maximum_weeks: m.maxCover,
    avg_weekly_sales_12_weeks: n1(m.avg12),
    avg_weekly_sales_last_4_weeks: n1(m.avg4),
    last_4_weeks_vs_12_week_average_percent: m.demandChange === null ? null : n1(m.demandChange * 100),
    festival_uplift_applied: m.festivalApplied,
    festival_uplift_percent: m.festivalApplied ? rules.festivalUplift * 100 : null,
    rules_could_not_decide_because: r.needsRaghavReason,
    data_issues: r.dataIssues,
    weekly_sales_oldest_to_newest: r.weeklySales,
  };
}

function collectNumbers(value: unknown, out: number[]) {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) out.push(Number(value));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
}

/** Numbers the model may quote for one SKU: its own facts plus the fixed rule constants. */
export function allowedNumbersFor(
  r: AiRec,
  rules: { recentWindowWeeks: number; avgWindowWeeks: number; highDemandThreshold: number; festivalUplift: number; highDemandQtyMultiplier: number } = config.rules,
): number[] {
  const out: number[] = [
    rules.recentWindowWeeks,
    rules.avgWindowWeeks,
    rules.highDemandThreshold * 100,
    rules.festivalUplift * 100,
    rules.highDemandQtyMultiplier,
  ];
  collectNumbers(factsFor(r, rules), out);
  return out;
}
