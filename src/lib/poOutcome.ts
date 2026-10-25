import type { CreateResult } from "./zoho/draftPo";

export type PoOutcome =
  | { kind: "created"; number: string; url: string | null; warning?: string }
  | { kind: "existing"; number: string; url: string | null }
  | { kind: "dry"; lines: { skuId: string; quantity: number }[]; request: string }
  | { kind: "error"; message: string };

/** Turns the server's answer to "create a draft PO" into what the bar shows. `orgUrl` is the Zoho Inventory base for the organisation. */
export function outcomeFromResult(r: CreateResult, orgUrl: string | null): PoOutcome {
  const link = (id: string | null) => (id && orgUrl ? `${orgUrl}#/purchaseorders/${id}` : null);
  if (!r.ok) return { kind: "error", message: r.message };
  if (r.mode === "dry_run") return { kind: "dry", lines: r.lines, request: JSON.stringify(r.payload, null, 2) };
  const number = r.po.zohoPoNumber ?? r.po.referenceNumber;
  if (r.mode === "already_created") return { kind: "existing", number, url: link(r.po.zohoPoId) };
  return { kind: "created", number, url: link(r.po.zohoPoId), warning: r.warning };
}
