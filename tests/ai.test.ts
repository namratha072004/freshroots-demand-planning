import { describe, expect, it } from "vitest";
import { disallowedNumbers } from "@/lib/ai/numberGuard";
import { allowedNumbersFor, factsFor, type AiRec } from "@/lib/ai/facts";
import { generateAi } from "@/lib/ai/enrich";
import { ReasonSchema, TriageSchema } from "@/lib/ai/schemas";
import type { GenerateJson } from "@/lib/gemini";

function rec(skuId: string, over: Partial<AiRec> = {}): AiRec {
  return {
    id: 1,
    skuId,
    skuName: "Test SKU",
    category: "Dairy",
    perishability: "High",
    action: "ORDER_NOW",
    quantity: 150,
    flags: ["STOCKOUT_RISK"],
    metrics: {
      weeksOfHistory: 16, avg12: 79.8, avg4: 81.0, demandForCover: 99.75, cover: 1.8,
      demandChange: 0.0150, festivalApplied: true, minCover: 3, maxCover: 4,
    },
    unitsOnHand: 180,
    needsRaghavReason: null,
    dataIssues: [],
    weeklySales: [70, 75, 80, 90, 81, 81, 81, 81],
    ...over,
  };
}
const FAR = () => Date.now() + 60_000;

describe("number guard", () => {
  const allowed = [1.8, 3, 4, 12, 25, 180];
  it("passes text that only quotes allowed numbers", () => {
    expect(disallowedNumbers("SKU004 has 1.8 weeks of stock after the 25% uplift, below the 3-week minimum.", allowed)).toEqual([]);
  });
  it("catches a rounded or invented number", () => {
    expect(disallowedNumbers("About 2 weeks of stock, down 40%", allowed)).toEqual(["2", "40"]);
  });
  it("ignores SKU ids and week labels", () => {
    expect(disallowedNumbers("SKU011 in 2026-W41 and W42 had 1.8 weeks", allowed)).toEqual([]);
  });
  it("handles thousands separators", () => {
    expect(disallowedNumbers("order 1,500 units", [1500])).toEqual([]);
    expect(disallowedNumbers("order 1,500 units", [150])).toEqual(["1,500"]);
  });
});

describe("facts handed to the model", () => {
  it("contain the calculated figures and rule constants, formatted once", () => {
    const f = factsFor(rec("SKU004"));
    expect(f.stock_cover_weeks).toBe("1.8");
    expect(f.avg_weekly_sales_last_4_weeks).toBe("81.0");
    expect(f.cover_minimum_weeks).toBe(3);
    expect(f.festival_uplift_percent).toBe(25);
  });
  it("allowed numbers include facts and the fixed rule constants", () => {
    const a = allowedNumbersFor(rec("SKU004"));
    for (const n of [1.8, 81, 79.8, 3, 4, 12, 25, 20, 1.5, 150, 180]) expect(a).toContain(n);
    expect(a).not.toContain(2);
  });
});

describe("output shapes", () => {
  it("Reason and Triage match the brief", () => {
    expect(ReasonSchema.safeParse({ sku_id: "SKU1", reason: "x" }).success).toBe(true);
    expect(ReasonSchema.safeParse({ sku_id: "SKU1" }).success).toBe(false);
    expect(TriageSchema.safeParse({ sku_id: "SKU1", needs_raghav: true, reason: "x" }).success).toBe(true);
    expect(TriageSchema.safeParse({ sku_id: "SKU1", needs_raghav: "yes", reason: "x" }).success).toBe(false);
  });
});

describe("generateAi", () => {
  const recs = [rec("SKU004"), rec("SKU011")];
  const good = (id: string) => ({ sku_id: id, reason: `${id} has 1.8 weeks of stock, below the 3-week minimum, so reorder now.` });

  /** Replies by looking at which task the prompt asks for. */
  const fake = (reasons: unknown, triage: unknown): GenerateJson => async ({ prompt }) => {
    const out = prompt.includes("needs_raghav") ? triage : reasons;
    if (out instanceof Error) throw out;
    return out;
  };

  it("keeps valid reasons and triage", async () => {
    const r = await generateAi(
      recs,
      fake(recs.map((x) => good(x.skuId)), [
        { sku_id: "SKU004", needs_raghav: false, reason: "Steady sales." },
        { sku_id: "SKU011", needs_raghav: true, reason: "Sales spiked then fell back, which may be a one-off event." },
      ]),
      FAR(),
    );
    expect(r.reasons.size).toBe(2);
    expect(r.triage.get("SKU011")).toEqual({ needsRaghav: true, reason: "Sales spiked then fell back, which may be a one-off event." });
    expect(r.errors).toEqual([]);
  });

  it("a failing model leaves no reasons and does not throw", async () => {
    const r = await generateAi(recs, fake(new Error("Gemini HTTP 500"), new Error("Gemini HTTP 500")), FAR());
    expect(r.reasons.size).toBe(0);
    expect(r.triage.size).toBe(0);
    expect(r.errors.length).toBe(2);
  });

  it("retries once after a temporary failure (timeout / 429 / 5xx) and then succeeds", async () => {
    let tries = 0;
    const generate: GenerateJson = async ({ prompt }) => {
      if (prompt.includes("needs_raghav")) return [];
      if (++tries === 1) throw new Error("The operation was aborted due to timeout");
      return recs.map((x) => good(x.skuId));
    };
    const r = await generateAi(recs, generate, FAR());
    expect(tries).toBe(2);
    expect(r.reasons.size).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it("does not retry a permanent failure (e.g. HTTP 400 or 403)", async () => {
    let tries = 0;
    const generate: GenerateJson = async ({ prompt }) => {
      if (prompt.includes("needs_raghav")) return [];
      tries++;
      throw new Error("Gemini HTTP 403: API key not valid");
    };
    const r = await generateAi(recs, generate, FAR());
    expect(tries).toBe(1);
    expect(r.reasons.size).toBe(0);
  });

  it("gives up after a single retry", async () => {
    let tries = 0;
    const generate: GenerateJson = async ({ prompt }) => {
      if (prompt.includes("needs_raghav")) return [];
      tries++;
      throw new Error("Gemini HTTP 503");
    };
    await generateAi(recs, generate, FAR());
    expect(tries).toBe(2);
  });

  it("one failed call does not lose the other", async () => {
    const r = await generateAi(recs, fake(new Error("timeout"), [{ sku_id: "SKU004", needs_raghav: false, reason: "Steady." }]), FAR());
    expect(r.reasons.size).toBe(0);
    expect(r.triage.size).toBe(1);
  });

  it("garbage output is rejected, not trusted", async () => {
    const r = await generateAi(recs, fake({ not: "an array" }, "nope"), FAR());
    expect(r.reasons.size).toBe(0);
    expect(r.triage.size).toBe(0);
  });

  it("drops invented SKUs and ignores duplicates", async () => {
    const r = await generateAi(recs, fake([good("SKU004"), good("SKU999"), { sku_id: "SKU004", reason: "second answer, 1.8 weeks" }], []), FAR());
    expect([...r.reasons.keys()]).toEqual(["SKU004"]);
    expect(r.reasons.get("SKU004")).toContain("reorder now");
  });

  it("drops a reason that quotes a number not in the data, then retries once", async () => {
    let calls = 0;
    const generate: GenerateJson = async ({ prompt }) => {
      if (prompt.includes("needs_raghav")) return [];
      calls++;
      return calls === 1
        ? [{ sku_id: "SKU004", reason: "Only about 2 weeks of stock left, so reorder." }, good("SKU011")]
        : [good("SKU004")];
    };
    const r = await generateAi(recs, generate, FAR());
    expect(calls).toBe(2);
    expect(r.reasons.get("SKU004")).toContain("1.8 weeks");
    expect(r.reasons.size).toBe(2);
  });

  it("if the retry also quotes a bad number the reason stays empty", async () => {
    const bad = [{ sku_id: "SKU004", reason: "Roughly 2 weeks left." }];
    const r = await generateAi([rec("SKU004")], fake(bad, []), FAR());
    expect(r.reasons.size).toBe(0);
    expect(r.errors.join(" ")).toMatch(/not in the data/);
  });

  it("does not retry when there is no time left", async () => {
    let calls = 0;
    const generate: GenerateJson = async ({ prompt }) => {
      if (prompt.includes("needs_raghav")) return [];
      calls++;
      return [{ sku_id: "SKU004", reason: "Roughly 2 weeks left." }];
    };
    await generateAi([rec("SKU004")], generate, Date.now() + 2_000);
    expect(calls).toBe(1);
  });

  it("keeps the needs-Raghav signal even when its sentence is dropped", async () => {
    const r = await generateAi([rec("SKU004")], fake([good("SKU004")], [{ sku_id: "SKU004", needs_raghav: true, reason: "A 40% spike." }]), FAR());
    expect(r.triage.get("SKU004")).toEqual({ needsRaghav: true, reason: null });
  });

  it("makes no calls when there is nothing to explain", async () => {
    const generate: GenerateJson = async () => {
      throw new Error("should not be called");
    };
    const r = await generateAi([], generate, FAR());
    expect(r.errors).toEqual([]);
  });
});
