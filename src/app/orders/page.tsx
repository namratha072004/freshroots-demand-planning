import { Boxes } from "lucide-react";
import { AppShell } from "../_components/AppShell";
import { FlagTable } from "../_components/FlagTable";
import { SummaryStrip } from "../_components/SummaryStrip";
import { loadBoard } from "@/lib/board";
import { orderTotals, pickRows } from "@/lib/views";

export const dynamic = "force-dynamic";

/** Proposed orders: the ORDER_NOW flags that have not been rejected, and what they add up to. */
export default async function OrdersPage() {
  const { shell, festivalPct, rows, decided } = await loadBoard();
  const orders = pickRows("orders", rows, decided);
  const { units, skus } = orderTotals(rows);
  const approved = orders.filter((r) => r.status === "APPROVED");
  const waiting = orders.filter((r) => r.status === "PENDING");
  const sum = (xs: typeof orders) => xs.reduce((s, r) => s + (r.quantity ?? 0), 0);

  return (
    <AppShell active="orders" title="Proposed orders" back={{ href: "/", label: "Overview" }} shell={shell} subtitle="Every ORDER_NOW flag that has not been rejected. Rejected ones are not counted.">
      <SummaryStrip
        items={[
          { label: "Proposed quantity", value: <>{units.toLocaleString("en-IN")} <small>units</small></>, note: `${skus} SKU${skus === 1 ? "" : "s"}` },
          { label: "Approved", value: <>{sum(approved).toLocaleString("en-IN")} <small>units</small></>, note: `${approved.length} SKU${approved.length === 1 ? "" : "s"}, ready for the draft PO` },
          { label: "Still waiting", value: <>{sum(waiting).toLocaleString("en-IN")} <small>units</small></>, note: `${waiting.length} SKU${waiting.length === 1 ? "" : "s"} to decide` },
        ]}
      />
      {orders.length === 0 ? (
        <div className="card empty section"><Boxes size={30} /><div>There are no proposed orders.</div></div>
      ) : (
        <div className="section"><FlagTable rows={orders} festivalPct={festivalPct} /></div>
      )}
    </AppShell>
  );
}
