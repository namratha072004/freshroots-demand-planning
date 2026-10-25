import { describe, expect, it } from "vitest";
import { batchKeyFor, buildBatch, buildPayload, referenceFor, type ApprovedLine } from "@/lib/zoho/batch";

const T = (d: string) => new Date(`2026-10-${d}T08:00:00Z`);
const line = (id: number, sku: string, qty: number, day = "19"): ApprovedLine => ({ recommendationId: id, skuId: sku, quantity: qty, decidedAt: T(day) });
const items = new Map([["SKU001", "z1"], ["SKU003", "z3"], ["SKU004", "z4"]]);

describe("buildBatch", () => {
  it("one PO line per approved ORDER_NOW line, sorted by SKU", () => {
    const b = buildBatch([line(3, "SKU004", 150), line(1, "SKU001", 750)])!;
    expect(b.lines.map((l) => [l.skuId, l.quantity])).toEqual([["SKU001", 750], ["SKU004", 150]]);
    expect(b.recommendationIds).toEqual([1, 3]);
  });
  it("nothing approved means no batch", () => {
    expect(buildBatch([])).toBeNull();
  });
  it("ignores zero, negative and fractional quantities", () => {
    expect(buildBatch([line(1, "SKU001", 0), line(2, "SKU003", -5), line(3, "SKU004", 1.5)])).toBeNull();
  });
  it("a SKU approved twice gets one line with the newest approval; both are covered by the PO", () => {
    const b = buildBatch([line(1, "SKU004", 100, "12"), line(9, "SKU004", 150, "19")])!;
    expect(b.lines).toEqual([{ skuId: "SKU004", quantity: 150, recommendationId: 9 }]);
    expect(b.recommendationIds).toEqual([1, 9]);
  });
  it("the batch key and reference number do not depend on input order", () => {
    const a = buildBatch([line(1, "SKU001", 5), line(2, "SKU003", 6)])!;
    const b = buildBatch([line(2, "SKU003", 6), line(1, "SKU001", 5)])!;
    expect(a.batchKey).toBe(b.batchKey);
    expect(a.referenceNumber).toBe(b.referenceNumber);
  });
  it("a different set of approvals is a different batch", () => {
    expect(batchKeyFor([1, 2])).not.toBe(batchKeyFor([1, 2, 3]));
    expect(referenceFor(batchKeyFor([1, 2]))).toMatch(/^FR-[0-9A-F]{10}$/);
  });
});

describe("buildPayload", () => {
  const batch = buildBatch([line(1, "SKU001", 750), line(3, "SKU004", 150)])!;
  it("has SKU/quantity lines only: no price, no status", () => {
    const p = buildPayload(batch, "vendor-1", items);
    expect(p.line_items).toEqual([{ item_id: "z1", quantity: 750 }, { item_id: "z4", quantity: 150 }]);
    expect(p.vendor_id).toBe("vendor-1");
    // Structure, not wording: the note may say "price to be added by procurement", but no field carries a price or a status.
    const fieldNames = [...Object.keys(p), ...p.line_items.flatMap((l) => Object.keys(l))].join(" ").toLowerCase();
    for (const forbidden of ["rate", "price", "status", "total", "issued", "sent", "tax"]) expect(fieldNames).not.toContain(forbidden);
    expect(Object.keys(p).sort()).toEqual(["line_items", "notes", "reference_number", "vendor_id"]);
    expect(Object.keys(p.line_items[0]).sort()).toEqual(["item_id", "quantity"]);
  });
  it("says DRAFT in the note and carries the reference number", () => {
    const p = buildPayload(batch, "v", items);
    expect(p.notes).toMatch(/DRAFT/);
    expect(p.reference_number).toBe(batch.referenceNumber);
  });
  it("refuses when a SKU has no Zoho item", () => {
    expect(() => buildPayload(buildBatch([line(1, "SKU099", 5)])!, "v", items)).toThrow(/SKU099/);
  });
});
