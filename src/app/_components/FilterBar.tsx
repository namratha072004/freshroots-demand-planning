import { Check, ListFilter, X } from "lucide-react";
import Link from "next/link";
import { REJECTION_LABELS, REJECTION_REASONS } from "@/lib/decisions";
import type { View, ViewCounts } from "@/lib/views";

const LABEL: Record<View, string> = { all: "All flags", pending: "To review", orders: "Proposed order", rejected: "Rejected", approved: "Approved" };
const HELP: Record<Exclude<View, "all">, string> = {
  pending: "Flags still waiting for your approve or reject.",
  orders: "The ORDER_NOW flags behind the proposed order quantity: every one that has not been rejected.",
  rejected: "Every rejection in the kill-switch window, the same decisions the rejection rate counts. Includes earlier runs.",
  approved: "Every approval in the kill-switch window, including earlier runs.",
};

/** Chips that switch the flag list, plus a one-line explanation and (for Rejected) why each one was rejected. */
export function FilterBar({
  view,
  counts,
  windowWeeks,
  reasons,
  totals,
}: {
  view: View;
  counts: ViewCounts;
  windowWeeks: number;
  reasons: Record<string, number>;
  totals: { units: number; skus: number };
}) {
  const order: View[] = ["all", "pending", "orders", "rejected", "approved"];
  return (
    <div className="filterbar" role="navigation" aria-label="Filter the flag list" id="flags">
      <div className="filter-chips">
        <ListFilter size={16} className="muted" />
        {order.map((v) => (
          <Link key={v} href={v === "all" ? "/#flags" : `/?view=${v}#flags`} scroll={false} className={`filter-chip ${view === v ? "on" : ""}`} aria-current={view === v ? "true" : undefined}>
            {view === v && <Check size={14} strokeWidth={3} />}
            {LABEL[v]} <span className="filter-count">{counts[v]}</span>
          </Link>
        ))}
        {view !== "all" && (
          <Link href="/#flags" scroll={false} className="filter-clear">
            <X size={14} /> Clear filter
          </Link>
        )}
      </div>
      {view !== "all" && (
        <div className="filter-note">
          <span>
            {HELP[view]}
            {(view === "rejected" || view === "approved") && ` (last ${windowWeeks} ${windowWeeks === 1 ? "week" : "weeks"})`}
          </span>
          {view === "orders" && <strong>{totals.units.toLocaleString("en-IN")} units across {totals.skus} SKU{totals.skus === 1 ? "" : "s"}</strong>}
          {view === "rejected" && counts.rejected > 0 && (
            <span className="reason-split">
              {REJECTION_REASONS.map((r) => (
                <span key={r} className="chip bad">{REJECTION_LABELS[r]} · {reasons[r] ?? 0}</span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
