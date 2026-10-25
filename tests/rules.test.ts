import { describe, expect, it } from "vitest";
import { evaluateSku, type SkuInput } from "@/lib/rules";

/** 16 weeks whose 12-week mean is avg12 and whose last-4 mean is avg4. */
function series(avg12: number, avg4: number): number[] {
  const early = (12 * avg12 - 4 * avg4) / 8;
  return [...Array(4).fill(early), ...Array(8).fill(early), ...Array(4).fill(avg4)];
}

function sku(over: Partial<SkuInput> & { avg12?: number; avg4?: number } = {}): SkuInput {
  const { avg12 = 100, avg4 = 100, ...rest } = over;
  return {
    skuId: "SKU999",
    perishability: "Low",
    standardReorderQty: 1000,
    weeklySales: series(avg12, avg4),
    unitsOnHand: 900,
    isFestivalMonth: false,
    ...rest,
  };
}

describe("brief examples (no festival month)", () => {
  it("avg 100, last4 130, stock 500: HIGH_DEMAND + STOCKOUT_RISK -> ORDER_NOW 1500", () => {
    const r = evaluateSku(sku({ avg4: 130, unitsOnHand: 500 }));
    expect(r.flags).toEqual(["HIGH_DEMAND", "STOCKOUT_RISK"]);
    expect(r.action).toBe("ORDER_NOW");
    expect(r.quantity).toBe(1500);
    expect(r.metrics.cover).toBeCloseTo(5);
    expect(r.reviewRequired).toBe(false);
  });

  it("flat demand, stock 1600: cover 16 -> OVERSTOCK_RISK, PAUSE_ORDER", () => {
    const r = evaluateSku(sku({ unitsOnHand: 1600 }));
    expect(r.flags).toEqual(["OVERSTOCK_RISK"]);
    expect(r.action).toBe("PAUSE_ORDER");
    expect(r.quantity).toBeNull();
  });

  it("stockout alone orders 1x the standard quantity", () => {
    const r = evaluateSku(sku({ unitsOnHand: 500 }));
    expect(r.flags).toEqual(["STOCKOUT_RISK"]);
    expect(r.action).toBe("ORDER_NOW");
    expect(r.quantity).toBe(1000);
  });

  it("healthy stock: no flag", () => {
    const r = evaluateSku(sku({ unitsOnHand: 900 }));
    expect(r.flags).toEqual([]);
    expect(r.action).toBe("NONE");
  });
});

describe("festival month (A2: uplift on the cover denominator only)", () => {
  it("avg 100 becomes 125; 500 / 125 = 4 weeks of cover", () => {
    const r = evaluateSku(sku({ isFestivalMonth: true, unitsOnHand: 500 }));
    expect(r.metrics.demandForCover).toBeCloseTo(125);
    expect(r.metrics.cover).toBeCloseTo(4);
    expect(r.flags).toEqual(["STOCKOUT_RISK"]);
  });

  it("uplift does not change the HIGH_DEMAND baseline", () => {
    // last4 is 15% above raw avg12: no HIGH_DEMAND, even though it is below the uplifted average too.
    expect(evaluateSku(sku({ isFestivalMonth: true, avg4: 115, unitsOnHand: 900 })).flags).not.toContain("HIGH_DEMAND");
    // 21% above raw avg12 fires even in a festival month.
    expect(evaluateSku(sku({ isFestivalMonth: true, avg4: 121, unitsOnHand: 900 })).flags).toContain("HIGH_DEMAND");
  });
});

describe("perishable SKUs (min 3, max 4 weeks)", () => {
  const p = (stock: number) => evaluateSku(sku({ perishability: "High", unitsOnHand: stock }));
  it("200 = 2 weeks -> ORDER_NOW", () => {
    expect(p(200).flags).toEqual(["STOCKOUT_RISK"]);
    expect(p(200).action).toBe("ORDER_NOW");
  });
  it("350 = 3.5 weeks -> no flag", () => {
    expect(p(350).flags).toEqual([]);
    expect(p(350).action).toBe("NONE");
  });
  it("500 = 5 weeks -> OVERSTOCK_RISK", () => {
    expect(p(500).flags).toEqual(["OVERSTOCK_RISK"]);
    expect(p(500).action).toBe("PAUSE_ORDER");
  });
  it("6 weeks of stock is overstock for perishables but fine for normal SKUs", () => {
    expect(evaluateSku(sku({ perishability: "High", unitsOnHand: 600 })).flags).toEqual(["OVERSTOCK_RISK"]);
    expect(evaluateSku(sku({ perishability: "Low", unitsOnHand: 600 })).flags).toEqual([]);
  });
  it("HIGH_DEMAND still applies to perishables", () => {
    const r = evaluateSku(sku({ perishability: "High", avg4: 130, unitsOnHand: 350 }));
    expect(r.flags).toEqual(["HIGH_DEMAND"]);
  });
});

describe("A3: combining flags", () => {
  it("HIGH_DEMAND with healthy stock: ORDER_NOW at 1.5x, flagged for review", () => {
    const r = evaluateSku(sku({ avg4: 130, unitsOnHand: 900 }));
    expect(r.flags).toEqual(["HIGH_DEMAND"]);
    expect(r.action).toBe("ORDER_NOW");
    expect(r.quantity).toBe(1500);
    expect(r.reviewRequired).toBe(true);
  });
  it("HIGH_DEMAND together with OVERSTOCK_RISK: NEEDS_RAGHAV, no quantity", () => {
    const r = evaluateSku(sku({ avg4: 130, unitsOnHand: 1600 }));
    expect(r.flags).toEqual(["HIGH_DEMAND", "OVERSTOCK_RISK"]);
    expect(r.action).toBe("NEEDS_RAGHAV");
    expect(r.quantity).toBeNull();
  });
});

describe("A4: data problems are NEEDS_RAGHAV", () => {
  it("under 12 weeks of history", () => {
    const r = evaluateSku(sku({ weeklySales: Array(11).fill(100) }));
    expect(r.action).toBe("NEEDS_RAGHAV");
    expect(r.needsRaghavReason).toMatch(/11 weeks/);
  });
  it("exactly 12 weeks is enough", () => {
    expect(evaluateSku(sku({ weeklySales: Array(12).fill(100) })).action).toBe("NONE");
  });
  it("missing inventory", () => {
    expect(evaluateSku(sku({ unitsOnHand: null })).action).toBe("NEEDS_RAGHAV");
  });
  it("missing master data", () => {
    expect(evaluateSku(sku({ perishability: null })).action).toBe("NEEDS_RAGHAV");
    expect(evaluateSku(sku({ standardReorderQty: null })).action).toBe("NEEDS_RAGHAV");
  });
  it("zero average sales (cover undefined) is NEEDS_RAGHAV, not a guess", () => {
    expect(evaluateSku(sku({ weeklySales: Array(16).fill(0) })).action).toBe("NEEDS_RAGHAV");
  });
});

describe("A5: exactly on a threshold is not flagged", () => {
  it("cover exactly 6 and exactly 14", () => {
    expect(evaluateSku(sku({ unitsOnHand: 600 })).flags).toEqual([]);
    expect(evaluateSku(sku({ unitsOnHand: 1400 })).flags).toEqual([]);
  });
  it("perishable cover exactly 3 and exactly 4", () => {
    expect(evaluateSku(sku({ perishability: "High", unitsOnHand: 300 })).flags).toEqual([]);
    expect(evaluateSku(sku({ perishability: "High", unitsOnHand: 400 })).flags).toEqual([]);
  });
  it("festival boundary: 750 / 125 = exactly 6", () => {
    expect(evaluateSku(sku({ isFestivalMonth: true, unitsOnHand: 750 })).flags).toEqual([]);
  });
  it("last-4 exactly 20% above the 12-week average is not HIGH_DEMAND", () => {
    expect(evaluateSku(sku({ avg4: 120, unitsOnHand: 900 })).flags).toEqual([]);
  });
  it("just past each threshold is flagged", () => {
    expect(evaluateSku(sku({ unitsOnHand: 599 })).flags).toEqual(["STOCKOUT_RISK"]);
    expect(evaluateSku(sku({ unitsOnHand: 1401 })).flags).toEqual(["OVERSTOCK_RISK"]);
  });
});

describe("quantity rounding", () => {
  it("rounds a fractional 1.5x up to whole units", () => {
    const r = evaluateSku(sku({ avg4: 130, unitsOnHand: 500, standardReorderQty: 201 }));
    expect(r.quantity).toBe(302); // 301.5 -> 302
  });
});
