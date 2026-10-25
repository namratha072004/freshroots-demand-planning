import { describe, expect, it } from "vitest";
import { outcomeFromResult } from "@/lib/poOutcome";
import type { CreateResult } from "@/lib/zoho/draftPo";

const ORG = "https://inventory.zoho.in/app/123";
const po = { id: 5, status: "created" as const, referenceNumber: "FR-ABC", zohoPoId: "999", zohoPoNumber: "PO-00003", zohoStatus: "draft", error: null, lines: [{ skuId: "SKU001", quantity: 300 }], createdAt: "2026-10-26T00:00:00Z" };

describe("what the Generate PO bar shows", () => {
  it("a created PO: its number and a link that opens it in Zoho", () => {
    const o = outcomeFromResult({ ok: true, mode: "created", po } as CreateResult, ORG);
    expect(o).toEqual({ kind: "created", number: "PO-00003", url: `${ORG}#/purchaseorders/999`, warning: undefined });
  });
  it("a warning from Zoho (e.g. not a draft) is passed on, not hidden", () => {
    const o = outcomeFromResult({ ok: true, mode: "created", po, warning: 'Zoho reports status "open", not "draft".' } as CreateResult, ORG);
    expect(o.kind === "created" && o.warning).toMatch(/not "draft"/);
  });
  it("a batch that already has a PO says so instead of making another", () => {
    expect(outcomeFromResult({ ok: true, mode: "already_created", po } as CreateResult, ORG)).toEqual({ kind: "existing", number: "PO-00003", url: `${ORG}#/purchaseorders/999` });
  });
  it("a dry run shows the request and creates nothing", () => {
    const o = outcomeFromResult({ ok: true, mode: "dry_run", payload: { vendor_id: "v", reference_number: "FR-ABC", notes: "n", line_items: [{ item_id: "i", quantity: 300 }] }, lines: [{ skuId: "SKU001", quantity: 300 }] } as CreateResult, ORG);
    expect(o.kind).toBe("dry");
    if (o.kind === "dry") {
      expect(o.lines).toEqual([{ skuId: "SKU001", quantity: 300 }]);
      expect(JSON.parse(o.request).line_items[0].quantity).toBe(300);
    }
  });
  it("a failure (kill switch, Zoho error, nothing approved) shows its message", () => {
    expect(outcomeFromResult({ ok: false, message: "The kill switch is stopped" }, ORG)).toEqual({ kind: "error", message: "The kill switch is stopped" });
  });
  it("without a Zoho organisation configured there is simply no link", () => {
    const o = outcomeFromResult({ ok: true, mode: "created", po } as CreateResult, null);
    expect(o.kind === "created" && o.url).toBeNull();
  });
  it("falls back to the reference number when Zoho gave no number", () => {
    const o = outcomeFromResult({ ok: true, mode: "created", po: { ...po, zohoPoNumber: null } } as CreateResult, ORG);
    expect(o.kind === "created" && o.number).toBe("FR-ABC");
  });
});
