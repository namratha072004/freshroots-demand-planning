import { describe, expect, it } from "vitest";
import type { FlagRow } from "@/lib/dashboard";
import { orderTotals, parseView, pickRows, reasonBreakdown, viewCounts } from "@/lib/views";

let id = 0;
const row = (over: Partial<FlagRow>): FlagRow => ({
  id: ++id, runId: 5, skuId: `SKU${id}`, skuName: "n", category: "c", flags: [], action: "ORDER_NOW", quantity: 100, recommendedQuantity: 100, edited: false, inPo: false, adjustmentReason: null, adjustmentNote: null, reviewRequired: false,
  needsRaghavReason: null, metrics: {} as never, dataIssues: [], reason: null, weekly: [], aiNeedsRaghav: null, aiTriageReason: null,
  status: "PENDING", rejectionReason: null, decidedAt: null, ...over,
});

// Latest run: 3 pending orders, 1 pending pause, 1 pending needs-judgment, 1 approved order, 1 rejected order.
const rows = [
  row({ quantity: 750 }), row({ quantity: 150 }), row({ quantity: 500 }),
  row({ action: "PAUSE_ORDER", quantity: null }),
  row({ action: "NEEDS_RAGHAV", quantity: null }),
  row({ status: "APPROVED", quantity: 300, decidedAt: "2026-10-20T10:00:00Z" }),
  row({ status: "REJECTED", quantity: 120, rejectionReason: "wrong_data", decidedAt: "2026-10-20T11:00:00Z" }),
];
// Decisions in the window, including an older run.
const decided = [
  rows[5], rows[6],
  row({ runId: 3, status: "REJECTED", rejectionReason: "rule_doesnt_fit", decidedAt: "2026-10-12T09:00:00Z" }),
  row({ runId: 3, status: "REJECTED", rejectionReason: "wrong_data", decidedAt: "2026-10-12T09:30:00Z" }),
  row({ runId: 3, status: "APPROVED", decidedAt: "2026-10-12T10:00:00Z" }),
];

describe("parseView", () => {
  it("accepts the known views and falls back to all", () => {
    for (const v of ["all", "pending", "orders", "rejected", "approved"]) expect(parseView(v)).toBe(v);
    for (const bad of [undefined, "", "x", "PENDING", "../etc", ["rejected", "pending"] as never]) expect(["all", "rejected"]).toContain(parseView(bad as never));
    expect(parseView("<script>")).toBe("all");
  });
});

describe("what each card opens", () => {
  it("To review: pending recommendations only, not 'needs your judgment', not decided", () => {
    const p = pickRows("pending", rows, decided);
    expect(p).toHaveLength(4);
    expect(p.every((r) => r.status === "PENDING" && r.action !== "NEEDS_RAGHAV")).toBe(true);
  });
  it("Proposed order: every ORDER_NOW that is not rejected (pending and approved), and the total matches the card", () => {
    const o = pickRows("orders", rows, decided);
    expect(o.map((r) => r.quantity).sort()).toEqual([150, 300, 500, 750]);
    expect(orderTotals(rows)).toEqual({ units: 1700, skus: 4 });
  });
  it("Rejected: every rejection in the window across runs, including the older run", () => {
    const r = pickRows("rejected", rows, decided);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.runId))).toEqual(new Set([5, 3]));
  });
  it("Approved: every approval in the window across runs", () => {
    expect(pickRows("approved", rows, decided)).toHaveLength(2);
  });
  it("All: the latest run's flags", () => {
    expect(pickRows("all", rows, decided)).toHaveLength(7);
  });
});

describe("counts shown on the filter chips equal the lists", () => {
  it("each count is the length of its list", () => {
    const c = viewCounts(rows, decided);
    expect(c).toEqual({ all: 7, pending: 4, orders: 4, rejected: 3, approved: 2 });
  });
  it("empty data gives zeros", () => {
    expect(viewCounts([], [])).toEqual({ all: 0, pending: 0, orders: 0, rejected: 0, approved: 0 });
    expect(orderTotals([])).toEqual({ units: 0, skus: 0 });
  });
});

describe("rejection reasons", () => {
  it("counts rejections per reason", () => {
    expect(reasonBreakdown(pickRows("rejected", rows, decided))).toEqual({ wrong_data: 2, rule_doesnt_fit: 1 });
  });
  it("is empty when nothing is rejected", () => {
    expect(reasonBreakdown([])).toEqual({});
  });
});
