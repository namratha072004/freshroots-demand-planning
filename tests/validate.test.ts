import { describe, expect, it } from "vitest";
import { isoWeekEnd, validateSku } from "@/lib/validate";

const weeks = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-W${String(from + i).padStart(2, "0")}`);

describe("isoWeekEnd", () => {
  it("2026-W42 ends Sunday 2026-10-18", () => expect(isoWeekEnd("2026-W42")).toBe("2026-10-18"));
  it("2026-W01 ends Sunday 2026-01-04", () => expect(isoWeekEnd("2026-W01")).toBe("2026-01-04"));
  it("2025-W01 starts in the previous year and ends 2025-01-05", () => expect(isoWeekEnd("2025-W01")).toBe("2025-01-05"));
});

describe("validateSku", () => {
  const ok = { weeks: weeks(27, 42), inventoryAsOf: "2026-10-19", asOf: "2026-10-19" };

  it("clean data has no issues", () => expect(validateSku(ok)).toEqual([]));
  it("missing inventory", () => expect(validateSku({ ...ok, inventoryAsOf: null })).toContain("MISSING_INVENTORY"));
  it("inventory exactly 7 days old is not stale", () =>
    expect(validateSku({ ...ok, inventoryAsOf: "2026-10-12" })).not.toContain("STALE_INVENTORY"));
  it("inventory 8 days old is stale", () =>
    expect(validateSku({ ...ok, inventoryAsOf: "2026-10-11" })).toContain("STALE_INVENTORY"));
  it("staleness follows asOf, not the real clock", () =>
    expect(validateSku({ ...ok, asOf: "2026-11-30" })).toEqual(expect.arrayContaining(["STALE_INVENTORY", "STALE_SALES"])));
  it("under 12 weeks is SHORT_HISTORY", () =>
    expect(validateSku({ ...ok, weeks: weeks(32, 42) })).toContain("SHORT_HISTORY"));
  it("a missing week is SALES_GAP", () =>
    expect(validateSku({ ...ok, weeks: weeks(27, 42).filter((w) => w !== "2026-W35") })).toContain("SALES_GAP"));
  it("no sales at all", () => expect(validateSku({ ...ok, weeks: [] })).toEqual(["NO_SALES"]));
});
