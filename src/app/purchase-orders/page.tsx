import { AppShell } from "../_components/AppShell";
import { DraftPoPanel } from "../_components/DraftPoPanel";
import { loadBoard } from "@/lib/board";

export const dynamic = "force-dynamic";

/** Purchase orders: the approved lines ready to go, the button, and every draft PO created in Zoho. */
export default async function PurchaseOrdersPage() {
  const { ks, shell } = await loadBoard();
  return (
    <AppShell active="pos" title="Purchase orders" back={{ href: "/", label: "Overview" }} shell={shell} subtitle="Draft purchase orders created in Zoho Inventory. Procurement adds the price and places the order inside Zoho.">
      <DraftPoPanel stopped={ks.stopped} />
    </AppShell>
  );
}
