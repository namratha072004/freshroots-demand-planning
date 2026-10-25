import { describe, expect, it } from "vitest";
import { CONFIRM_ABOVE_MULTIPLE, MAX_QTY, needsHighConfirm, parseQuantity } from "@/lib/quantity";

describe("parseQuantity", () => {
  it("accepts whole numbers from 1 to the maximum, typed or numeric", () => {
    for (const [input, value] of [[300, 300], ["300", 300], [" 750 ", 750], ["1,500", 1500], [1, 1], [MAX_QTY, MAX_QTY]] as const) {
      expect(parseQuantity(input)).toEqual({ ok: true, value });
    }
  });
  it("refuses empty, non-numbers, decimals, zero, negatives and absurd sizes, each with a clear message", () => {
    const bad: [unknown, RegExp][] = [
      ["", /enter a quantity/i],
      [null, /enter a quantity/i],
      [undefined, /enter a quantity/i],
      ["abc", /enter a number/i],
      [NaN, /enter a number/i],
      [Infinity, /enter a number/i],
      ["12.5", /whole number/i],
      [0, /at least 1/i],
      ["-5", /at least 1/i],
      [MAX_QTY + 1, /more than/i],
    ];
    for (const [input, msg] of bad) {
      const r = parseQuantity(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(msg);
    }
  });
  it("zero points the planner to Reject instead of ordering nothing", () => {
    const r = parseQuantity(0);
    expect(!r.ok && r.error).toMatch(/reject/i);
  });
});

describe("needsHighConfirm", () => {
  it("asks twice only when the order is more than twice the recommendation", () => {
    expect(CONFIRM_ABOVE_MULTIPLE).toBe(2);
    expect(needsHighConfirm(750, 750)).toBe(false);
    expect(needsHighConfirm(300, 750)).toBe(false); // lowering is the normal case
    expect(needsHighConfirm(1500, 750)).toBe(false); // exactly twice is fine
    expect(needsHighConfirm(1501, 750)).toBe(true);
  });
  it("does not ask when there is no recommendation to compare with", () => {
    expect(needsHighConfirm(5000, null)).toBe(false);
    expect(needsHighConfirm(5000, 0)).toBe(false);
  });
});

import { ADJUSTMENT_LABELS, ADJUSTMENT_REASONS, MAX_NOTE_LENGTH } from "@/lib/adjustmentReasons";
import { describeDelta, parseAdjustment } from "@/lib/quantity";

describe("describeDelta (system suggested vs planner)", () => {
  it("gives the unit and percent difference; negative means ordering less", () => {
    expect(describeDelta(750, 300)).toEqual({ units: -450, percent: -60 });
    expect(describeDelta(150, 200)).toEqual({ units: 50, percent: 33.3 });
    expect(describeDelta(500, 500)).toEqual({ units: 0, percent: 0 });
  });
  it("does not divide by zero", () => {
    expect(describeDelta(0, 10)).toEqual({ units: 10, percent: 0 });
  });
});

describe("parseAdjustment: a change needs a number and a reason", () => {
  it("accepts a valid quantity with a listed reason, and keeps the optional note", () => {
    expect(parseAdjustment({ quantity: 300, reason: "stock_inbound", note: "  2 pallets arriving Friday " })).toEqual({
      ok: true,
      value: { quantity: 300, reason: "stock_inbound", note: "2 pallets arriving Friday" },
    });
    expect(parseAdjustment({ quantity: "300", reason: "my_judgment" })).toEqual({ ok: true, value: { quantity: 300, reason: "my_judgment", note: null } });
  });
  it("refuses a change with no reason or an unknown reason", () => {
    for (const reason of [undefined, "", "because", "DEMAND_CHANGE", 7]) {
      const r = parseAdjustment({ quantity: 300, reason });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/reason/i);
    }
  });
  it("refuses a bad quantity even with a good reason", () => {
    for (const quantity of [0, -3, 12.5, "x", "", null]) expect(parseAdjustment({ quantity, reason: "my_judgment" }).ok).toBe(false);
  });
  it("refuses a note that is too long", () => {
    expect(parseAdjustment({ quantity: 5, reason: "my_judgment", note: "x".repeat(MAX_NOTE_LENGTH + 1) }).ok).toBe(false);
    expect(parseAdjustment({ quantity: 5, reason: "my_judgment", note: "x".repeat(MAX_NOTE_LENGTH) }).ok).toBe(true);
  });
  it("refuses nothing-at-all input", () => {
    expect(parseAdjustment(null).ok).toBe(false);
    expect(parseAdjustment(undefined).ok).toBe(false);
  });
  it("every reason has a human label", () => {
    for (const r of ADJUSTMENT_REASONS) expect(ADJUSTMENT_LABELS[r].length).toBeGreaterThan(5);
  });
});
