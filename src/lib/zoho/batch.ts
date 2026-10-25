import { createHash } from "node:crypto";
import { config } from "@/config";
import type { PoPayload } from "./client";

export interface ApprovedLine {
  recommendationId: number;
  skuId: string;
  quantity: number;
  /** When the approval was made, newest wins if a SKU was approved twice. */
  decidedAt: Date;
}

export interface Batch {
  /** One line per SKU (the newest approval). */
  lines: { skuId: string; quantity: number; recommendationId: number }[];
  /** Every recommendation this PO covers, including older duplicate approvals for the same SKU. */
  recommendationIds: number[];
  batchKey: string;
  referenceNumber: string;
}

/** Stable hash of a set of recommendation ids, independent of order. */
export function batchKeyFor(ids: number[]): string {
  return createHash("sha256").update([...ids].sort((a, b) => a - b).join(",")).digest("hex");
}
export const referenceFor = (batchKey: string) => `FR-${batchKey.slice(0, 10).toUpperCase()}`;

/** Approved, not yet batched ORDER_NOW lines -> one PO line per SKU. Pure. */
export function buildBatch(approved: ApprovedLine[]): Batch | null {
  const valid = approved.filter((a) => Number.isInteger(a.quantity) && a.quantity > 0);
  if (valid.length === 0) return null;
  const newest = new Map<string, ApprovedLine>();
  for (const a of valid) {
    const cur = newest.get(a.skuId);
    if (!cur || a.decidedAt > cur.decidedAt || (a.decidedAt.getTime() === cur.decidedAt.getTime() && a.recommendationId > cur.recommendationId)) newest.set(a.skuId, a);
  }
  const lines = [...newest.values()]
    .sort((a, b) => a.skuId.localeCompare(b.skuId))
    .map((a) => ({ skuId: a.skuId, quantity: a.quantity, recommendationId: a.recommendationId }));
  const recommendationIds = valid.map((a) => a.recommendationId).sort((a, b) => a - b);
  const batchKey = batchKeyFor(recommendationIds);
  return { lines, recommendationIds, batchKey, referenceNumber: referenceFor(batchKey) };
}

/** The request body for Zoho. SKU and quantity only: no price field at all, no status field. */
export function buildPayload(batch: Batch, vendorId: string, itemIds: Map<string, string>): PoPayload {
  const missing = batch.lines.filter((l) => !itemIds.has(l.skuId)).map((l) => l.skuId);
  if (missing.length) throw new Error(`These SKUs have no matching item in Zoho: ${missing.join(", ")}`);
  return {
    vendor_id: vendorId,
    reference_number: batch.referenceNumber,
    notes: config.zoho.poNote,
    line_items: batch.lines.map((l) => ({ item_id: itemIds.get(l.skuId)!, quantity: l.quantity })),
  };
}
