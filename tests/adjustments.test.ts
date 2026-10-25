import { describe, expect, it } from "vitest";
import { adjustmentStats, type AdjustmentRow } from "@/lib/adjustments";
import { ACTIVITY_GROUPS } from "@/lib/activity";

let id = 0;
const row = (sku: string, suggested: number, chosen: number, reason: string | null): AdjustmentRow => ({
  recommendationId: ++id, skuId: sku, skuName: `Name ${sku}`, category: "c", runId: 1, suggested, chosen,
  deltaUnits: chosen - suggested, deltaPercent: Math.round(((chosen - suggested) / suggested) * 1000) / 10,
  reason, note: null, changes: 1, lastChangedAt: "2026-10-25T10:00:00Z", status: "APPROVED", inPo: false,
});

describe("adjustmentStats", () => {
  const rows = [
    row("SKU001", 750, 300, "stock_inbound"),   // -450, -60%
    row("SKU001", 750, 600, "demand_change"),   // -150, -20%
    row("SKU004", 150, 200, "demand_change"),   // +50, +33.3%
    row("SKU011", 500, 250, "budget_limit"),    // -250, -50%
  ];
  const s = adjustmentStats(rows);
  it("counts, nets and averages the differences", () => {
    expect(s.adjusted).toBe(4);
    expect(s.lowered).toBe(3);
    expect(s.raised).toBe(1);
    expect(s.netUnits).toBe(-450 - 150 + 50 - 250);
    expect(s.averagePercent).toBeCloseTo((-60 - 20 + 33.3 - 50) / 4, 1);
    expect(s.averageSizePercent).toBeCloseTo((60 + 20 + 33.3 + 50) / 4, 1); // size ignores direction
  });
  it("counts reasons and names the most common one", () => {
    expect(s.byReason).toMatchObject({ stock_inbound: 1, demand_change: 2, budget_limit: 1, supplier_limit: 0, data_wrong: 0, my_judgment: 0 });
    expect(s.topReason).toBe("demand_change");
  });
  it("rolls up by SKU so the least-trusted products are listed first", () => {
    expect(s.bySku.map((x) => x.skuId)).toEqual(["SKU001", "SKU011", "SKU004"]);
    expect(s.bySku[0]).toMatchObject({ skuId: "SKU001", count: 2, netUnits: -600, averagePercent: -40 });
  });
  it("a rise and a cut of the same size cancel in the signed average but not in the size", () => {
    const x = adjustmentStats([row("SKU001", 100, 150, "my_judgment"), row("SKU002", 100, 50, "my_judgment")]);
    expect(x.averagePercent).toBe(0);
    expect(x.averageSizePercent).toBe(50);
  });
  it("an empty history gives zeros and no top reason", () => {
    const e = adjustmentStats([]);
    expect(e).toMatchObject({ adjusted: 0, averagePercent: 0, averageSizePercent: 0, netUnits: 0, topReason: null, bySku: [] });
  });
  it("a missing reason is not counted as one", () => {
    expect(adjustmentStats([row("SKU001", 100, 50, null)]).topReason).toBeNull();
  });
});

describe("activity log groups", () => {
  it("every kind of action belongs to exactly one filter group", () => {
    const all = Object.values(ACTIVITY_GROUPS).flatMap((g) => [...g.kinds]);
    expect(new Set(all).size).toBe(all.length);
    for (const k of ["decision.approved", "decision.rejected", "quantity.adjusted", "run.completed", "po.created", "po.dry_run", "killswitch.stopped", "killswitch.resumed", "lead.marked", "settings.changed", "session.login", "session.logout"]) {
      expect(all).toContain(k);
    }
  });
});
