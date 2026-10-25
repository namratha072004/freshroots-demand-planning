import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { evaluateSku } from "@/lib/rules";
import { isFestivalMonth } from "@/lib/calendar";

const read = (f: string): Record<string, string>[] =>
  parse(readFileSync(path.join(process.cwd(), "data", f), "utf8"), { columns: true, skip_empty_lines: true, trim: true });

const ASOF = "2026-10-19";
const master = read("sku_master.csv");
const sales = read("weekly_sales.csv");
const inventory = read("current_inventory.csv");
const calendar = read("calendar.csv").map((c) => ({
  yearMonth: c.Year_Month,
  isFestivalMonth: c.Is_Festival_Month.toUpperCase() === "TRUE",
}));

const results = Object.fromEntries(
  master.map((m) => {
    const weekly = sales
      .filter((s) => s.SKU_ID === m.SKU_ID)
      .sort((a, b) => a.Week.localeCompare(b.Week))
      .map((s) => Number(s.Units_Sold));
    const inv = inventory.find((i) => i.SKU_ID === m.SKU_ID);
    return [
      m.SKU_ID,
      evaluateSku({
        skuId: m.SKU_ID,
        perishability: m.Perishability as "Low" | "High",
        standardReorderQty: Number(m.Standard_Reorder_Qty),
        weeklySales: weekly,
        unitsOnHand: inv ? Number(inv.Units_On_Hand) : null,
        isFestivalMonth: isFestivalMonth(calendar, ASOF),
      }),
    ];
  }),
);

describe("seed data as of 2026-10-19 (festival month)", () => {
  it("October is a festival month", () => {
    expect(isFestivalMonth(calendar, ASOF)).toBe(true);
  });

  // [sku, avg12, avg4, stock, cover, flags]  -- from the brief's expected table
  const expected: [string, number, number, number, number, string[]][] = [
    ["SKU001", 214.9, 261.0, 900, 3.4, ["HIGH_DEMAND", "STOCKOUT_RISK"]],
    ["SKU003", 150.5, 150.8, 820, 4.4, ["STOCKOUT_RISK"]],
    ["SKU004", 79.8, 81.0, 180, 1.8, ["STOCKOUT_RISK"]],
    ["SKU006", 39.6, 40.2, 1100, 22.2, ["OVERSTOCK_RISK"]],
    ["SKU007", 121.5, 133.5, 620, 4.1, ["OVERSTOCK_RISK"]],
    ["SKU011", 204.3, 209.2, 460, 1.8, ["STOCKOUT_RISK"]],
    ["SKU013", 45.4, 44.8, 180, 3.2, ["STOCKOUT_RISK"]],
  ];

  it.each(expected)("%s matches the expected table", (id, avg12, avg4, stock, cover, flags) => {
    const r = results[id];
    expect(r.metrics.avg12).toBeCloseTo(avg12, 1);
    // Table values are rounded to 1 decimal; true values can sit on a .x5 half (150.75, 209.25).
    expect(Math.abs(r.metrics.avg4! - avg4)).toBeLessThan(0.06);
    expect(inventory.find((i) => i.SKU_ID === id)?.Units_On_Hand).toBe(String(stock));
    expect(r.metrics.cover).toBeCloseTo(cover, 1);
    expect(r.flags).toEqual(flags);
  });

  it("every other SKU has no flag and is not NEEDS_RAGHAV", () => {
    const flagged = new Set(expected.map((e) => e[0]));
    for (const [id, r] of Object.entries(results)) {
      if (flagged.has(id)) continue;
      expect(r.flags, id).toEqual([]);
      expect(r.action, id).toBe("NONE");
    }
  });

  it("actions: perishable SKU004 orders its standard quantity; SKU001 orders 1.5x", () => {
    const std = (id: string) => Number(master.find((m) => m.SKU_ID === id)!.Standard_Reorder_Qty);
    expect(results.SKU004.action).toBe("ORDER_NOW");
    expect(results.SKU004.quantity).toBe(std("SKU004"));
    expect(results.SKU001.quantity).toBe(Math.ceil(std("SKU001") * 1.5));
    expect(results.SKU006.action).toBe("PAUSE_ORDER");
    expect(results.SKU007.action).toBe("PAUSE_ORDER");
  });
});
