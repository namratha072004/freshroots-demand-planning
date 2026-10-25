import { describe, expect, it } from "vitest";
import { config } from "@/config";
import { evaluateSku, type SkuInput } from "@/lib/rules";
import { evaluateKillSwitch, type DecisionRecord } from "@/lib/killSwitchRules";
import { validateSku } from "@/lib/validate";
import { allowedNumbersFor, type AiRec } from "@/lib/ai/facts";
import { collectLeads, type LeadDeps } from "@/lib/launches/collect";
import { SETTING_DEFS, applyOverrides, crossErrors, defaultSettings, validateEdits } from "@/lib/settings";

const base = defaultSettings({} as never);

describe("defaults", () => {
  it("match src/config.ts exactly, so an untouched Settings page changes nothing", () => {
    expect(base.rules.cover).toEqual(config.rules.cover);
    expect(base.rules.coverPerishable).toEqual(config.rules.coverPerishable);
    expect(base.rules.highDemandThreshold).toBe(config.rules.highDemandThreshold);
    expect(base.rules.festivalUplift).toBe(config.rules.festivalUplift);
    expect(base.killSwitch).toEqual(config.killSwitch);
    expect(base.data.staleDays).toBe(config.data.staleDays);
    expect(base.launches.maxSearchesPerRun).toBe(config.launches.maxSearchesPerRun);
    expect(base.zohoDryRun).toBe(false);
  });
  it("ZOHO_DRY_RUN=true in the environment makes dry run the default", () => {
    expect(defaultSettings({ ZOHO_DRY_RUN: "true" } as never).zohoDryRun).toBe(true);
  });
  it("every editable value has a sensible range that contains its default", () => {
    for (const d of SETTING_DEFS) {
      const v = d.path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], base) as number;
      expect(v, d.key).toBeGreaterThanOrEqual(d.min);
      expect(v, d.key).toBeLessThanOrEqual(d.max);
    }
  });
});

describe("applyOverrides", () => {
  it("overlays saved values and leaves the rest alone", () => {
    const s = applyOverrides(base, { "rules.cover.min": 4, "killSwitch.minDecisions": 8 });
    expect(s.rules.cover.min).toBe(4);
    expect(s.killSwitch.minDecisions).toBe(8);
    expect(s.rules.cover.max).toBe(14);
  });
  it("ignores unknown keys and out-of-range values", () => {
    const s = applyOverrides(base, { "rules.cover.min": -3, "nonsense.key": 9, "killSwitch.windowWeeks": 99 });
    expect(s).toEqual(base);
  });
  it("applies the PO mode flag", () => {
    expect(applyOverrides(base, { "po.dryRun": true }).zohoDryRun).toBe(true);
  });
  it("a saved set that breaks an ordering rule is ignored as a whole", () => {
    expect(applyOverrides(base, { "rules.cover.min": 20 })).toEqual(base); // min 20 >= max 14
  });
  it("does not modify the defaults object it was given", () => {
    const before = JSON.stringify(base);
    applyOverrides(base, { "rules.cover.min": 4 });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("validateEdits", () => {
  it("converts percent fields from display units (20) to fractions (0.2)", () => {
    const { next, errors } = validateEdits({ "rules.highDemandThreshold": 30, "rules.festivalUplift": 10 }, base);
    expect(errors).toEqual([]);
    expect(next.rules.highDemandThreshold).toBeCloseTo(0.3);
    expect(next.rules.festivalUplift).toBeCloseTo(0.1);
  });
  it("rejects values outside the allowed range, naming the field", () => {
    const { errors } = validateEdits({ "killSwitch.windowWeeks": 99 }, base);
    expect(errors.join(" ")).toMatch(/Measured over.*between 1 and 12/);
  });
  it("rejects non-numbers and fractional values in whole-number fields", () => {
    expect(validateEdits({ "data.staleDays": NaN }, base).errors.length).toBe(1);
    expect(validateEdits({ "data.staleDays": 7.5 }, base).errors.join(" ")).toMatch(/whole number/);
  });
  it("requires minimum cover below maximum cover, for normal and perishable SKUs", () => {
    expect(validateEdits({ "rules.cover.min": 15 }, base).errors.join(" ")).toMatch(/minimum weeks of cover must be lower/i);
    expect(validateEdits({ "rules.coverPerishable.min": 5 }, base).errors.join(" ")).toMatch(/perishable minimum/i);
  });
  it("requires the alert level below the stop level", () => {
    expect(validateEdits({ "killSwitch.alertRate": 30 }, base).errors.join(" ")).toMatch(/alert level must be lower/i);
  });
  it("accepts a valid edit with no errors", () => {
    expect(validateEdits({ "rules.cover.min": 4, "rules.cover.max": 12 }, base).errors).toEqual([]);
    expect(crossErrors(base)).toEqual([]);
  });
});

// A SKU averaging 100/week with 500 units on hand has 5.0 weeks of cover.
const sku = (over: Partial<SkuInput> = {}): SkuInput => ({
  skuId: "SKU999", perishability: "Low", standardReorderQty: 1000, weeklySales: Array(16).fill(100), unitsOnHand: 500, isFestivalMonth: false, ...over,
});

describe("an edited rule changes what the engine decides", () => {
  it("lowering the stockout line from 6 to 4 weeks clears a 5-week SKU", () => {
    expect(evaluateSku(sku()).flags).toEqual(["STOCKOUT_RISK"]);
    const s = applyOverrides(base, { "rules.cover.min": 4 });
    expect(evaluateSku(sku(), s.rules).flags).toEqual([]);
  });
  it("lowering the overstock line from 14 to 4.5 weeks makes the same 5-week SKU overstock", () => {
    const s = applyOverrides(base, { "rules.cover.min": 3, "rules.cover.max": 4.5 });
    expect(evaluateSku(sku(), s.rules).flags).toEqual(["OVERSTOCK_RISK"]);
  });
  it("the high-demand multiplier changes the quantity", () => {
    const spike = sku({ weeklySales: [...Array(12).fill(100), ...Array(4).fill(140)], unitsOnHand: 900 });
    expect(evaluateSku(spike).quantity).toBe(1500);
    expect(evaluateSku(spike, applyOverrides(base, { "rules.highDemandQtyMultiplier": 2 }).rules).quantity).toBe(2000);
  });
  it("the high-demand threshold changes when it fires", () => {
    const rise = sku({ weeklySales: [...Array(12).fill(100), ...Array(4).fill(140)], unitsOnHand: 900 }); // +23.5% vs the 12-week average
    expect(evaluateSku(rise).flags).toContain("HIGH_DEMAND");
    expect(evaluateSku(rise, applyOverrides(base, { "rules.highDemandThreshold": 0.3 }).rules).flags).not.toContain("HIGH_DEMAND");
  });
  it("the festival uplift changes weeks of cover", () => {
    const festival = sku({ isFestivalMonth: true, unitsOnHand: 650 });
    expect(evaluateSku(festival).metrics.cover).toBeCloseTo(5.2);
    expect(evaluateSku(festival, applyOverrides(base, { "rules.festivalUplift": 0 }).rules).metrics.cover).toBeCloseTo(6.5);
  });
  it("perishable windows are editable", () => {
    const p = sku({ perishability: "High", unitsOnHand: 350 });
    expect(evaluateSku(p).flags).toEqual([]);
    expect(evaluateSku(p, applyOverrides(base, { "rules.coverPerishable.min": 4, "rules.coverPerishable.max": 6 }).rules).flags).toEqual(["STOCKOUT_RISK"]);
  });
  it("the minimum history changes who is handed to Raghav", () => {
    const short = sku({ weeklySales: Array(12).fill(100), unitsOnHand: 900 });
    expect(evaluateSku(short).action).toBe("NONE");
    expect(evaluateSku(short, applyOverrides(base, { "rules.minHistoryWeeks": 14 }).rules).action).toBe("NEEDS_RAGHAV");
  });
});

describe("other places read the edited values", () => {
  const dec = (a: number, r: number): DecisionRecord[] => [
    ...Array.from({ length: a }, () => ({ status: "APPROVED", action: "ORDER_NOW", decidedAt: new Date("2026-11-08T00:00:00Z") })),
    ...Array.from({ length: r }, () => ({ status: "REJECTED", action: "ORDER_NOW", decidedAt: new Date("2026-11-08T00:00:00Z") })),
  ];
  const now = new Date("2026-11-10T00:00:00Z");
  it("kill switch: a lower minimum lets it stop sooner; a higher stop level delays it", () => {
    expect(evaluateKillSwitch(dec(3, 1), now, null).wouldStop).toBe(false); // 4 decided < 20
    expect(evaluateKillSwitch(dec(3, 1), now, null, applyOverrides(base, { "killSwitch.minDecisions": 4 }).killSwitch).wouldStop).toBe(true);
    expect(evaluateKillSwitch(dec(3, 1), now, null, applyOverrides(base, { "killSwitch.minDecisions": 4, "killSwitch.stopRate": 0.5 }).killSwitch).wouldStop).toBe(false);
  });
  it("data checks: stale days and minimum history are taken from the settings", () => {
    const weeks = Array.from({ length: 16 }, (_, i) => `2026-W${String(27 + i).padStart(2, "0")}`);
    const check = { weeks, inventoryAsOf: "2026-10-14", asOf: "2026-10-19" }; // 5 days old
    expect(validateSku(check)).toEqual([]);
    expect(validateSku(check, { staleDays: 3, minHistoryWeeks: 12 })).toContain("STALE_INVENTORY");
    expect(validateSku(check, { staleDays: 7, minHistoryWeeks: 20 })).toContain("SHORT_HISTORY");
  });
  it("the AI number guard allows the edited thresholds, so its sentences can quote them", () => {
    const rec = { id: 1, skuId: "S", skuName: "n", category: "c", perishability: "Low", action: "ORDER_NOW", quantity: 10, flags: [], unitsOnHand: 1, needsRaghavReason: null, dataIssues: [], weeklySales: [1],
      metrics: { weeksOfHistory: 1, avg12: 1, avg4: 1, demandForCover: 1, cover: 1, demandChange: 0, festivalApplied: false, minCover: 6, maxCover: 14 } } as AiRec;
    const edited = applyOverrides(base, { "rules.highDemandThreshold": 0.35, "rules.festivalUplift": 0.4 }).rules;
    expect(allowedNumbersFor(rec, edited)).toEqual(expect.arrayContaining([35, 40]));
    expect(allowedNumbersFor(rec)).not.toContain(35);
  });
  it("launches: the search cap and the age window come from the settings", async () => {
    let calls = 0;
    const d: LeadDeps = { now: new Date("2026-10-25T00:00:00Z"), search: async () => (calls++, { text: "", chunks: [], supports: [], queries: [] }), fetchSource: async () => null };
    await collectLeads(["A", "B", "C", "D", "E", "F"], d, Date.now() + 60_000, 1, { maxAgeDays: 180, maxSearchesPerRun: 3 });
    expect(calls).toBe(3);
  });
});
