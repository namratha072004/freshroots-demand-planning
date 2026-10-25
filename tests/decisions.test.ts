import { describe, expect, it } from "vitest";
import { parseRejectionReason, REJECTION_REASONS } from "@/lib/decisions";

describe("parseRejectionReason", () => {
  it("accepts the three allowed reasons", () => {
    for (const r of REJECTION_REASONS) expect(parseRejectionReason(r)).toBe(r);
  });
  it("rejects anything else, including empty", () => {
    for (const bad of ["", "other", undefined, null, 5]) expect(() => parseRejectionReason(bad)).toThrow();
  });
});
