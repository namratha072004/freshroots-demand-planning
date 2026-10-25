/** Why the planner changed a quantity the rules suggested. No server code, so client components can import it. */
export const ADJUSTMENT_REASONS = ["demand_change", "stock_inbound", "supplier_limit", "budget_limit", "data_wrong", "my_judgment"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_LABELS: Record<AdjustmentReason, string> = {
  demand_change: "Demand is changing (promotion, season, news)",
  stock_inbound: "Stock is already on the way",
  supplier_limit: "Supplier minimum, pack size or availability",
  budget_limit: "Budget or cash limit",
  data_wrong: "The data looks wrong",
  my_judgment: "My own judgment",
};

export const MAX_NOTE_LENGTH = 300;
