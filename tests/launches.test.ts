import { describe, expect, it } from "vitest";
import { candidatesFromResponse, parseLeadList } from "@/lib/launches/grounding";
import { extractPublishedDate } from "@/lib/launches/pageDate";
import { collectLeads, LaunchLeadSchema, type LeadDeps } from "@/lib/launches/collect";
import { isSafePublicUrl, fetchSource } from "@/lib/launches/fetchSource";
import { pickCategories } from "@/lib/launches/step";
import { parseLeadMark } from "@/lib/leads";
import type { GroundedResponse } from "@/lib/gemini";

const NOW = new Date("2026-10-25T08:00:00Z");
const GU = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";

/** Build a response in the list format the prompt asks for, with supports over each item's text. */
function response(leads: { title: string; summary: string; chunks: number[] }[], nChunks = 3): GroundedResponse {
  const lines = leads.map((l, i) => `${i + 1}. **${l.title}**: ${l.summary}`);
  const text = "Here are some recent launches:\n\n" + lines.join("\n") + "\n";
  const bytes = Buffer.from(text);
  const supports = leads.map((l, i) => {
    const start = bytes.indexOf(Buffer.from(lines[i]));
    return { start, end: start + Buffer.byteLength(lines[i]), chunkIndices: l.chunks };
  });
  return {
    text,
    chunks: Array.from({ length: nChunks }, (_, i) => ({ uri: `${GU}c${i}`, title: `site${i}.com` })),
    supports: supports.filter((x) => x.chunkIndices.length > 0),
    queries: ["q"],
  };
}
const page = (date: string | null) => `<html><head>${date ? `<meta property="article:published_time" content="${date}">` : ""}</head></html>`;

function deps(res: GroundedResponse, pages: Record<string, string | null>): LeadDeps {
  return {
    now: NOW,
    search: async () => res,
    fetchSource: async (uri) => (pages[uri] === undefined || pages[uri] === null ? null : { url: `https://news.example/${uri.split("/").pop()}`, html: pages[uri]! }),
  };
}
const FAR = Date.now() + 60_000;

describe("reading the model's list", () => {
  it("reads numbered items with a bold title and a colon", () => {
    const t = "Intro line.\n\n1. **Brand A Oat Drink**: Brand A launched an oat drink.\n2. **Brand B Chips**: Brand B launched chips.\n";
    expect(parseLeadList(t).map((l) => [l.title, l.summary])).toEqual([
      ["Brand A Oat Drink", "Brand A launched an oat drink."],
      ["Brand B Chips", "Brand B launched chips."],
    ]);
  });
  it("reads bullets, a colon inside the bold, and unbolded 'title: summary'", () => {
    const t = "* **Brand A Drink:** Launched a drink.\n- Brand B Chips - Launched chips.\n- Brand C Tea: Launched tea.\n";
    expect(parseLeadList(t).map((l) => l.title)).toEqual(["Brand A Drink", "Brand B Chips", "Brand C Tea"]);
  });
  it("joins a wrapped or nested continuation to the same lead", () => {
    const t = "1. **Brand A Drink**: First part\n   second part.\n   * extra detail\n2. **Brand B**: Other.\n";
    const r = parseLeadList(t);
    expect(r).toHaveLength(2);
    expect(r[0].summary).toBe("First part second part. extra detail");
  });
  it("ignores prose, headings and answers with no list", () => {
    expect(parseLeadList("I could not find any new launches.")).toEqual([]);
    expect(parseLeadList("## Heading\nSome text\n")).toEqual([]);
  });
  it("skips items that are too long to be a one-line summary", () => {
    expect(parseLeadList(`1. **A**: ${"x".repeat(500)}\n`)).toEqual([]);
  });
  it("byte spans match the UTF-8 text Google's offsets refer to", () => {
    const t = "Intro ₹\n1. **Café Drink**: ₹10 drink.\n";
    const [item] = parseLeadList(t);
    expect(Buffer.from(t).subarray(item.start, item.end).toString()).toBe("1. **Café Drink**: ₹10 drink.");
  });
});

describe("grounding: a lead's sources come only from supports over its own text", () => {
  it("maps each lead to its chunks; a lead with no support has none", () => {
    const res = response([
      { title: "Brand A Oat Drink", summary: "Brand A launched an oat drink.", chunks: [0] },
      { title: "Brand B Chips", summary: "Brand B launched chips.", chunks: [1, 2] },
      { title: "Brand C Tea", summary: "Brand C launched tea.", chunks: [] },
    ]);
    const c = candidatesFromResponse(res);
    expect(c[0].chunks.map((x) => x.title)).toEqual(["site0.com"]);
    expect(c[1].chunks.map((x) => x.title)).toEqual(["site1.com", "site2.com"]);
    expect(c[2].chunks).toEqual([]);
  });
  it("survives non-ASCII text (offsets are bytes)", () => {
    const res = response([{ title: "Café Ünïcode Drink ₹10", summary: "Brand launched a ₹10 drink.", chunks: [2] }]);
    expect(candidatesFromResponse(res)[0].chunks.map((x) => x.title)).toEqual(["site2.com"]);
  });
});

describe("page publication date", () => {
  const cases: [string, string, string | null][] = [
    ["meta article:published_time", '<meta property="article:published_time" content="2026-09-14T10:00:00+05:30">', "2026-09-14"],
    ["meta name=date", '<meta name="date" content="2026-08-02">', "2026-08-02"],
    ["JSON-LD datePublished", '<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2026-07-30T06:00:00Z"}]}</script>', "2026-07-30"],
    ["itemprop", '<span itemprop="datePublished" content="2026-06-01"></span>', "2026-06-01"],
    ["<time datetime>", '<time datetime="2026-10-01T08:00:00Z">Oct 1</time>', "2026-10-01"],
    ["no date at all", "<html><body>Hello</body></html>", null],
    ["junk date", '<meta property="article:published_time" content="not a date">', null],
    ["implausible year", '<meta property="article:published_time" content="1970-01-01">', null],
  ];
  it.each(cases)("%s", (_n, html, expected) => expect(extractPublishedDate(html)).toBe(expected));
});

describe("collectLeads", () => {
  const lead = { title: "Brand A Oat Drink", summary: "Brand A launched an oat drink.", chunks: [0] };

  it("keeps a grounded lead with a recent page date; url and date come from the page, not the model", async () => {
    const { leads, stats } = await collectLeads(["Beverage"], deps(response([lead]), { [`${GU}c0`]: page("2026-09-20") }), FAR, 1);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ category: "Beverage", source_date: "2026-09-20", source_url: "https://news.example/c0", source_site: "site0.com" });
    expect(stats.kept).toBe(1);
  });
  it("drops a lead with no grounded source, keeps its supported neighbour", async () => {
    const other = { title: "Brand B Chips", summary: "Brand B launched chips.", chunks: [1] };
    const { leads, stats } = await collectLeads(
      ["Beverage"],
      deps(response([{ ...lead, chunks: [] }, other]), { [`${GU}c1`]: page("2026-10-01") }),
      FAR,
      1,
    );
    expect(leads.map((l) => l.title)).toEqual(["Brand B Chips"]);
    expect(stats.dropped.noGroundedSource).toBe(1);
  });
  it("drops a lead whose source page has no date", async () => {
    const { leads, stats } = await collectLeads(["Beverage"], deps(response([lead]), { [`${GU}c0`]: page(null) }), FAR, 1);
    expect(leads).toHaveLength(0);
    expect(stats.dropped.noPageDate).toBe(1);
  });
  it("drops a lead whose source page cannot be read", async () => {
    const { stats } = await collectLeads(["Beverage"], deps(response([lead]), {}), FAR, 1);
    expect(stats.dropped.sourceUnreadable).toBe(1);
  });
  it("drops a lead older than 180 days; keeps one at the limit", async () => {
    const old = await collectLeads(["Beverage"], deps(response([lead]), { [`${GU}c0`]: page("2026-04-01") }), FAR, 1);
    expect(old.leads).toHaveLength(0);
    expect(old.stats.dropped.tooOld).toBe(1);
    const edge = await collectLeads(["Beverage"], deps(response([lead]), { [`${GU}c0`]: page("2026-04-28") }), FAR, 1);
    expect(edge.leads).toHaveLength(1);
  });
  it("the same product reached through different articles is kept once (title match ignores case and punctuation)", async () => {
    const two = [
      { title: "SIX6R Sparkling Water", summary: "Canned sparkling water.", chunks: [0] },
      { title: "Six6R sparkling water!", summary: "Canned sparkling water line.", chunks: [1] },
    ];
    const { leads, stats } = await collectLeads(["Beverage"], deps(response(two), { [`${GU}c0`]: page("2026-10-01"), [`${GU}c1`]: page("2026-10-05") }), FAR, 1);
    expect(leads).toHaveLength(1);
    expect(leads[0].source_date).toBe("2026-10-01"); // the first one wins
    expect(stats.dropped.duplicate).toBe(1);
  });
  it("the same title in a different category is not a duplicate", async () => {
    const d: LeadDeps = {
      now: NOW,
      search: async (p) => {
        const r = response([{ title: "Brand A Drink", summary: "A drink.", chunks: [0] }]);
        const tag = p.includes('"Dairy Alt"') ? "-dairy" : "-bev";
        return { ...r, chunks: r.chunks.map((c) => ({ ...c, uri: c.uri + tag })) };
      },
      fetchSource: async (uri) => ({ url: `https://news.example/${uri.split("/").pop()}`, html: page("2026-10-01") }),
    };
    const out = await collectLeads(["Beverage", "Dairy Alt"], d, FAR, 1);
    expect(out.leads.map((l) => l.category).sort()).toEqual(["Beverage", "Dairy Alt"]);
  });
  it("reads an answer's source pages as soon as it arrives, not after the slowest search (grounding links expire)", async () => {
    const events: string[] = [];
    const d: LeadDeps = {
      now: NOW,
      search: async (p) => {
        const slow = p.includes('"Beverage"');
        await new Promise((r) => setTimeout(r, slow ? 80 : 5));
        events.push(slow ? "slow search done" : "fast search done");
        return response([{ title: slow ? "Slow Drink" : "Fast Chips", summary: "Launched.", chunks: [0] }]).chunks.length
          ? { ...response([{ title: slow ? "Slow Drink" : "Fast Chips", summary: "Launched.", chunks: [0] }]), chunks: [{ uri: `${GU}${slow ? "slow" : "fast"}`, title: "site.com" }] }
          : response([]);
      },
      fetchSource: async (uri) => {
        events.push(`fetch ${uri.split("/").pop()}`);
        return { url: `https://news.example/${uri.split("/").pop()}`, html: page("2026-10-01") };
      },
    };
    const { leads } = await collectLeads(["Snack", "Beverage"], d, FAR, 1);
    expect(leads).toHaveLength(2);
    expect(events.indexOf("fetch fast")).toBeLessThan(events.indexOf("slow search done"));
  });
  it("loads at most 6 source pages at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const many = Array.from({ length: 3 }, (_, i) => ({ title: `Brand ${i} Drink`, summary: `Brand ${i} launched a drink.`, chunks: [0, 1, 2] }));
    const d: LeadDeps = {
      now: NOW,
      search: async (p) => {
        const r = response(many);
        const tag = p.match(/"([^"]+)" products/)?.[1] ?? "x";
        return { ...r, chunks: r.chunks.map((c) => ({ ...c, uri: c.uri + tag })) };
      },
      fetchSource: async (uri) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return { url: `https://news.example/${uri.split("/").pop()}`, html: page("2026-10-01") };
      },
    };
    await collectLeads(["A", "B", "C", "D", "E"], d, FAR, 1);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
  });
  it("a search keeps at most 3 candidates", async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ title: `Brand ${i} Drink`, summary: `Brand ${i} launched a drink.`, chunks: [i % 3] }));
    const { stats } = await collectLeads(["Beverage"], deps(response(five), {}), FAR, 1);
    expect(stats.candidates).toBe(3);
  });
  it("drops a lead dated in the future", async () => {
    const { leads } = await collectLeads(["Beverage"], deps(response([lead]), { [`${GU}c0`]: page("2027-03-01") }), FAR, 1);
    expect(leads).toHaveLength(0);
  });
  it("uses the next source when the first has no usable date", async () => {
    const { leads } = await collectLeads(["Beverage"], deps(response([{ ...lead, chunks: [0, 1] }]), { [`${GU}c0`]: page(null), [`${GU}c1`]: page("2026-10-02") }), FAR, 1);
    expect(leads[0].source_date).toBe("2026-10-02");
    expect(leads[0].grounding_uri).toBe(`${GU}c1`);
  });
  it("drops demand claims, advice to stock, and model-written dates", async () => {
    const bad = [
      { title: "X", summary: "Freshroots should stock this because demand will be high.", chunks: [0] },
      { title: "Y", summary: "Experts recommend retailers stock it.", chunks: [0] },
      { title: "Z", summary: "Launched in October with a new flavour.", chunks: [0] },
    ];
    const { leads, stats } = await collectLeads(["Beverage"], deps(response(bad), { [`${GU}c0`]: page("2026-10-01") }), FAR, 1);
    expect(leads).toHaveLength(0);
    expect(stats.dropped.forbiddenText).toBe(3);
    const more = await collectLeads(["Beverage"], deps(response([{ title: "W", summary: "Strong demand expected.", chunks: [0] }]), { [`${GU}c0`]: page("2026-10-01") }), FAR, 1);
    expect(more.stats.dropped.forbiddenText).toBe(1);
  });
  it("dedupes leads that cite the same article", async () => {
    const two = [lead, { title: "Brand A Oat Drink (again)", summary: "Brand A launched an oat drink again.", chunks: [0] }];
    const { leads, stats } = await collectLeads(["Beverage"], deps(response(two), { [`${GU}c0`]: page("2026-10-01") }), FAR, 1);
    expect(leads).toHaveLength(1);
    expect(stats.dropped.duplicate).toBe(1);
  });
  it("a failing search is counted and does not throw; other categories still work", async () => {
    const d: LeadDeps = {
      now: NOW,
      search: async (prompt) => {
        if (prompt.includes('"Snack"')) throw new Error("Gemini HTTP 500");
        return response([lead]);
      },
      fetchSource: async () => ({ url: "https://news.example/a", html: page("2026-10-01") }),
    };
    const { leads, stats } = await collectLeads(["Snack", "Beverage"], d, FAR, 1);
    expect(leads).toHaveLength(1);
    expect(stats.searchesFailed).toBe(1);
    expect(stats.errors[0]).toMatch(/Snack/);
  });
  it("the search prompt names only the given category and today's real date", async () => {
    let seen = "";
    const d: LeadDeps = { now: NOW, search: async (p) => ((seen = p), response([])), fetchSource: async () => null };
    await collectLeads(["Dairy Alt"], d, FAR, 1);
    expect(seen).toContain('"Dairy Alt"');
    expect(seen).toContain("2026-10-25");
    expect(seen).toContain("2026-04-28");
  });
});

describe("search budget and ungrounded answers", () => {
  const lead = { title: "Brand A Oat Drink", summary: "Brand A launched an oat drink.", chunks: [0] };
  const ungrounded: GroundedResponse = { text: '```json\n[{"title":"Made Up","summary":"From memory only."}]\n```', chunks: [], supports: [], queries: [] };
  const fetchOk: LeadDeps["fetchSource"] = async () => ({ url: "https://news.example/a", html: page("2026-10-01") });

  it("an answer with no grounding is dropped and the category is retried; the retry can succeed", async () => {
    let calls = 0;
    const d: LeadDeps = { now: NOW, fetchSource: fetchOk, search: async () => (++calls === 1 ? ungrounded : response([lead])) };
    const { leads, stats } = await collectLeads(["Beverage"], d, FAR);
    expect(calls).toBe(2);
    expect(leads).toHaveLength(1);
    expect(stats).toMatchObject({ searches: 2, ungrounded: 1, categoriesWithoutGrounding: [] });
  });
  it("memory-only answers never become leads, and the category is reported", async () => {
    const d: LeadDeps = { now: NOW, fetchSource: fetchOk, search: async () => ungrounded };
    const { leads, stats } = await collectLeads(["Beverage"], d, FAR);
    expect(leads).toHaveLength(0);
    expect(stats.searches).toBe(2); // attemptsPerCategory: the first call plus one retry
    expect(stats.categoriesWithoutGrounding).toEqual(["Beverage"]);
  });
  it("never exceeds the per-run cap of search calls, tries included", async () => {
    let calls = 0;
    const d: LeadDeps = { now: NOW, fetchSource: fetchOk, search: async () => (calls++, ungrounded) };
    const { stats } = await collectLeads(["A", "B", "C", "D", "E", "F", "G"], d, FAR);
    expect(calls).toBe(10); // the configured cap, not 14
    expect(stats.searches).toBe(calls);
  });
  it("the first call for every category goes out at the same time", async () => {
    let inFlight = 0;
    let peak = 0;
    const d: LeadDeps = {
      now: NOW,
      fetchSource: fetchOk,
      search: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return ungrounded;
      },
    };
    await collectLeads(["A", "B", "C", "D", "E"], d, FAR);
    expect(peak).toBe(5);
  });
  it("failed searches are counted and the others still count", async () => {
    const d: LeadDeps = { now: NOW, fetchSource: fetchOk, search: async (p) => (p.includes('"Snack"') ? Promise.reject(new Error("Gemini HTTP 500")) : response([lead])) };
    const { leads, stats } = await collectLeads(["Snack", "Beverage"], d, FAR);
    expect(stats).toMatchObject({ searches: 2, searchesFailed: 1 }); // an outage is not retried
    expect(leads).toHaveLength(1);
  });
});

describe("launch lead shape", () => {
  const ok = { title: "Brand A Drink", category: "Beverage", source_url: "https://news.example/a", source_date: "2026-10-01", summary: "A drink.", grounding_uri: "g", source_site: "news.example" };
  it("accepts { title, category, source_url, source_date, summary } (plus audit fields)", () => expect(LaunchLeadSchema.safeParse(ok).success).toBe(true));
  it("rejects a bad URL, a bad date, or a missing field", () => {
    for (const bad of [{ ...ok, source_url: "not a url" }, { ...ok, source_date: "1 Oct 2026" }, { ...ok, title: "" }, { ...ok, summary: undefined }]) expect(LaunchLeadSchema.safeParse(bad).success).toBe(false);
  });
  it("every kept lead passes the schema", async () => {
    const d: LeadDeps = { now: NOW, search: async () => response([{ title: "Brand A Oat Drink", summary: "Brand A launched an oat drink.", chunks: [0] }]), fetchSource: async () => ({ url: "https://news.example/a", html: page("2026-10-01") }) };
    const { leads } = await collectLeads(["Beverage"], d, FAR, 1);
    expect(leads).toHaveLength(1);
    for (const l of leads) expect(LaunchLeadSchema.safeParse(l).success).toBe(true);
  });
});

describe("source fetching is restricted", () => {
  it("only follows Google grounding links first", async () => {
    let called = false;
    const f = (async () => ((called = true), new Response("x"))) as typeof fetch;
    expect(await fetchSource("https://evil.example/grounding-api-redirect/abc", f)).toBeNull();
    expect(await fetchSource("http://127.0.0.1/", f)).toBeNull();
    expect(called).toBe(false);
  });
  it("blocks internal hosts on later hops", async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })) as typeof fetch;
    expect(await fetchSource(`${GU}abc`, f)).toBeNull();
  });
  it("follows redirects to the publisher and returns its html", async () => {
    let n = 0;
    const f = (async () =>
      n++ === 0
        ? new Response(null, { status: 302, headers: { location: "https://news.example/story" } })
        : new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    expect(await fetchSource(`${GU}abc`, f)).toEqual({ url: "https://news.example/story", html: "<html>ok</html>" });
  });
  it("isSafePublicUrl", () => {
    expect(isSafePublicUrl(new URL("https://www.afaqs.com/x"))).toBe(true);
    for (const u of ["http://localhost/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "ftp://a.com/", "http://intranet/", "http://[::1]/"]) {
      expect(isSafePublicUrl(new URL(u)), u).toBe(false);
    }
  });
});

describe("categories and marks", () => {
  it("searches only existing categories (deduplicated)", () => {
    expect(pickCategories(["Snack", "Beverage", "Snack", "Staple"], 1, 10)).toEqual(["Beverage", "Snack", "Staple"]);
  });
  it("searches every category when they fit under the cap", () => {
    const five = ["Beverage", "Condiment", "Dairy Alt", "Snack", "Staple"];
    expect(pickCategories(five, 1, 10)).toEqual(five);
  });
  it("rotates when there are more categories than the cap, so every category comes up over successive runs", () => {
    const seven = ["A", "B", "C", "D", "E", "F", "G"];
    const seen = new Set<string>();
    for (let run = 1; run <= 2; run++) {
      const p = pickCategories(seven, run, 5);
      expect(p).toHaveLength(5);
      p.forEach((c) => seen.add(c));
    }
    expect(seen.size).toBe(7);
  });
  it("marks must be interested or ignore", () => {
    expect(parseLeadMark("interested")).toBe("interested");
    expect(parseLeadMark("ignore")).toBe("ignore");
    for (const bad of ["", "maybe", undefined, 1]) expect(() => parseLeadMark(bad)).toThrow();
  });
});
