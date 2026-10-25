import { config } from "@/config";

export type Flag = "HIGH_DEMAND" | "STOCKOUT_RISK" | "OVERSTOCK_RISK";
export type Action = "ORDER_NOW" | "PAUSE_ORDER" | "NEEDS_RAGHAV" | "NONE";

export interface SkuInput {
  skuId: string;
  /** null when the SKU is missing from sku_master. */
  perishability: "Low" | "High" | null;
  standardReorderQty: number | null;
  /** Units sold per week, oldest first. */
  weeklySales: number[];
  /** null when there is no inventory row for the SKU. */
  unitsOnHand: number | null;
  /** Is the run month a festival month in the calendar. */
  isFestivalMonth: boolean;
}

export interface Metrics {
  weeksOfHistory: number;
  avg12: number | null;
  avg4: number | null;
  /** avg12 after the festival uplift (the denominator for weeks of cover). */
  demandForCover: number | null;
  cover: number | null;
  /** avg4 / avg12 - 1, e.g. 0.3 = 30% above. */
  demandChange: number | null;
  festivalApplied: boolean;
  minCover: number | null;
  maxCover: number | null;
}

export interface RuleResult {
  skuId: string;
  flags: Flag[];
  action: Action;
  /** Recommended order quantity. Only set for ORDER_NOW. */
  quantity: number | null;
  /** True when the order should be reviewed (HIGH_DEMAND with healthy stock). */
  reviewRequired: boolean;
  /** Why the system is not deciding, when action is NEEDS_RAGHAV. */
  needsRaghavReason: string | null;
  metrics: Metrics;
}

const { rules } = config;
const gt = (a: number, b: number) => a > b + rules.epsilon;
const lt = (a: number, b: number) => a < b - rules.epsilon;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function emptyMetrics(weeks: number, festival: boolean): Metrics {
  return {
    weeksOfHistory: weeks,
    avg12: null,
    avg4: null,
    demandForCover: null,
    cover: null,
    demandChange: null,
    festivalApplied: festival,
    minCover: null,
    maxCover: null,
  };
}

function needsRaghav(input: SkuInput, reason: string, metrics: Metrics, flags: Flag[] = []): RuleResult {
  return {
    skuId: input.skuId,
    flags,
    action: "NEEDS_RAGHAV",
    quantity: null,
    reviewRequired: false,
    needsRaghavReason: reason,
    metrics,
  };
}

/** Deterministic rules engine: Raghav's 5 rules plus assumptions A1-A5. No I/O, no AI. */
export function evaluateSku(input: SkuInput): RuleResult {
  const weeks = input.weeklySales.length;
  const base = emptyMetrics(weeks, input.isFestivalMonth);

  // A4: missing master data, missing inventory, or short history -> not decided by the system.
  if (input.perishability === null || input.standardReorderQty === null) {
    return needsRaghav(input, "Missing SKU master data.", base);
  }
  if (input.unitsOnHand === null) {
    return needsRaghav(input, "Missing inventory data.", base);
  }
  if (weeks < rules.minHistoryWeeks) {
    return needsRaghav(
      input,
      `Only ${weeks} weeks of sales history; at least ${rules.minHistoryWeeks} are needed.`,
      base,
    );
  }

  const last12 = input.weeklySales.slice(-rules.avgWindowWeeks);
  const last4 = input.weeklySales.slice(-rules.recentWindowWeeks);
  const avg12 = mean(last12);
  const avg4 = mean(last4);
  const demandForCover = avg12 * (input.isFestivalMonth ? 1 + rules.festivalUplift : 1);
  const limits = input.perishability === "High" ? rules.coverPerishable : rules.cover;

  const metrics: Metrics = {
    weeksOfHistory: weeks,
    avg12,
    avg4,
    demandForCover,
    cover: demandForCover > 0 ? input.unitsOnHand / demandForCover : null,
    demandChange: avg12 > 0 ? avg4 / avg12 - 1 : null,
    festivalApplied: input.isFestivalMonth,
    minCover: limits.min,
    maxCover: limits.max,
  };

  // Not in the brief: with zero average sales, weeks of cover is undefined. Do not guess.
  if (demandForCover <= 0) {
    return needsRaghav(input, "Average weekly sales is zero, so weeks of cover cannot be calculated.", metrics);
  }

  const cover = input.unitsOnHand / demandForCover;
  const flags: Flag[] = [];
  const highDemand = gt(avg4, avg12 * (1 + rules.highDemandThreshold));
  const stockout = lt(cover, limits.min);
  const overstock = gt(cover, limits.max);
  if (highDemand) flags.push("HIGH_DEMAND");
  if (stockout) flags.push("STOCKOUT_RISK");
  if (overstock) flags.push("OVERSTOCK_RISK");

  // A3: HIGH_DEMAND together with OVERSTOCK_RISK is a conflict the system does not resolve.
  if (highDemand && overstock) {
    return needsRaghav(
      input,
      "Demand is rising but stock is above the maximum cover; the signals conflict.",
      metrics,
      flags,
    );
  }

  // A3: ORDER_NOW wins over PAUSE_ORDER.
  if (stockout || highDemand) {
    const raw = input.standardReorderQty * (highDemand ? rules.highDemandQtyMultiplier : 1);
    return {
      skuId: input.skuId,
      flags,
      action: "ORDER_NOW",
      quantity: rules.roundQtyUp ? Math.ceil(raw - rules.epsilon) : Math.round(raw),
      reviewRequired: highDemand && !stockout,
      needsRaghavReason: null,
      metrics,
    };
  }

  if (overstock) {
    return {
      skuId: input.skuId,
      flags,
      action: "PAUSE_ORDER",
      quantity: null,
      reviewRequired: false,
      needsRaghavReason: null,
      metrics,
    };
  }

  return { skuId: input.skuId, flags, action: "NONE", quantity: null, reviewRequired: false, needsRaghavReason: null, metrics };
}
