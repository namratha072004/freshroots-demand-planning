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
