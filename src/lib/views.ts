import type { FlagRow } from "./dashboard";

/** What the flag list is filtered to. The headline cards link to these (?view=...). */
export type View = "all" | "pending" | "orders" | "rejected" | "approved";

export const VIEWS: View[] = ["all", "pending", "orders", "rejected", "approved"];

export function parseView(v: string | string[] | undefined): View {
  const s = Array.isArray(v) ? v[0] : v;
  return (VIEWS as string[]).includes(s ?? "") ? (s as View) : "all";
}

export interface ViewCounts {
  all: number;
  pending: number;
  orders: number;
  rejected: number;
  approved: number;
}

/** The rows for each view. `rows` is the latest run; `decided` is every approved/rejected decision in the kill-switch window. */
export function pickRows(view: View, rows: FlagRow[], decided: FlagRow[]): FlagRow[] {
  switch (view) {
    case "pending":
      return rows.filter((r) => r.status === "PENDING" && r.action !== "NEEDS_RAGHAV");
    case "orders":
      return rows.filter((r) => r.action === "ORDER_NOW" && r.status !== "REJECTED");
    case "rejected":
      return decided.filter((r) => r.status === "REJECTED");
    case "approved":
      return decided.filter((r) => r.status === "APPROVED");
    default:
      return rows;
  }
}

export function viewCounts(rows: FlagRow[], decided: FlagRow[]): ViewCounts {
  return {
    all: rows.length,
    pending: pickRows("pending", rows, decided).length,
    orders: pickRows("orders", rows, decided).length,
    rejected: pickRows("rejected", rows, decided).length,
    approved: pickRows("approved", rows, decided).length,
  };
}

/** How many rejections were given for each reason, for the Rejected view. */
export function reasonBreakdown(rejected: FlagRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rejected) if (r.rejectionReason) out[r.rejectionReason] = (out[r.rejectionReason] ?? 0) + 1;
  return out;
}

/** Total units and SKU count behind the "Proposed order quantity" card. */
export function orderTotals(rows: FlagRow[]): { units: number; skus: number } {
  const o = pickRows("orders", rows, []);
  return { units: o.reduce((s, r) => s + (r.quantity ?? 0), 0), skus: o.length };
}
