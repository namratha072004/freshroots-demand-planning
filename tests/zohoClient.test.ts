import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDryRun, ZohoClient, ZohoError, zohoEnv, type ZohoEnv } from "@/lib/zoho/client";

const ENV: ZohoEnv = { clientId: "cid", clientSecret: "csecret", refreshToken: "rtoken", orgId: "999", accountsUrl: "https://accounts.zoho.in", apiUrl: "https://www.zohoapis.in" };
type Call = { url: string; method: string; body?: string; auth?: string };

function fakeZoho(handler: (c: Call) => { status?: number; json?: unknown } | "throw") {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const c: Call = { url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization };
    calls.push(c);
    if (url.includes("/oauth/v2/token")) return new Response(JSON.stringify({ access_token: `at${calls.filter((x) => x.url.includes("/oauth")).length}`, expires_in: 3600 }), { status: 200 });
    const r = handler(c);
    if (r === "throw") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, client: new ZohoClient(ENV, fetchImpl) };
}

const PAYLOAD = { vendor_id: "v1", reference_number: "FR-ABC", notes: "n", line_items: [{ item_id: "i1", quantity: 5 }] };

describe("Zoho client", () => {
  it("signs in with the refresh token, India endpoints, and reuses the access token", async () => {
    const { calls, client } = fakeZoho(() => ({ json: { code: 0, items: [] } }));
    await client.listItems();
    await client.listItems();
    const tokenCalls = calls.filter((c) => c.url.includes("/oauth"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].url).toBe("https://accounts.zoho.in/oauth/v2/token");
    expect(tokenCalls[0].body).toContain("grant_type=refresh_token");
    const api = calls.filter((c) => !c.url.includes("/oauth"));
    expect(api[0].url).toMatch(/^https:\/\/www\.zohoapis\.in\/inventory\/v1\/items\?/);
    expect(api[0].url).toContain("organization_id=999");
    expect(api[0].auth).toBe("Zoho-oauthtoken at1");
  });
  it("on a 401 it refreshes the token once and retries", async () => {
    let n = 0;
    const { calls, client } = fakeZoho(() => (++n === 1 ? { status: 401, json: { code: 57, message: "no" } } : { json: { code: 0, items: [{ item_id: "1", sku: "S", name: "n", status: "active" }] } }));
    expect(await client.listItems()).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("/oauth"))).toHaveLength(2);
  });
  it("creates a PO with a single POST to /purchaseorders carrying the payload as-is", async () => {
    const { calls, client } = fakeZoho(() => ({ json: { code: 0, message: "success", purchaseorder: { purchaseorder_id: "PO1", purchaseorder_number: "PO-001", status: "draft" } } }));
    const po = await client.createPurchaseOrder(PAYLOAD);
    expect(po).toMatchObject({ purchaseorder_id: "PO1", purchaseorder_number: "PO-001", status: "draft" });
    const posts = calls.filter((c) => c.method === "POST" && !c.url.includes("/oauth"));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toMatch(/\/inventory\/v1\/purchaseorders\?organization_id=999$/);
    expect(JSON.parse(posts[0].body!)).toEqual(PAYLOAD);
  });
  it("also accepts the documented spelling purchase_order", async () => {
    const { client } = fakeZoho(() => ({ json: { code: 0, purchase_order: { purchaseorder_id: "PO2", purchaseorder_number: "PO-002", status: "draft" } } }));
    expect((await client.createPurchaseOrder(PAYLOAD)).purchaseorder_id).toBe("PO2");
  });
  it("a success reply we cannot read is NOT a clean failure: the PO probably exists, so it must be re-checked", async () => {
    for (const weird of [{ code: 0, message: "success" }, { code: 0, something_else: { id: 1 } }, { code: 0, purchaseorder: {} }]) {
      const { client } = fakeZoho(() => ({ json: weird }));
      const err = await client.createPurchaseOrder(PAYLOAD).catch((e) => e);
      expect(err).toBeInstanceOf(ZohoError);
      expect(err.answered).toBe(false); // -> stored as 'unknown', lines stay locked, next click looks Zoho up first
    }
  });
  it("an error answer from Zoho is 'answered' (nothing created)", async () => {
    const { client } = fakeZoho(() => ({ status: 400, json: { code: 1001, message: "Invalid value" } }));
    const err = await client.createPurchaseOrder(PAYLOAD).catch((e) => e);
    expect(err).toBeInstanceOf(ZohoError);
    expect(err.answered).toBe(true);
    expect(err.message).toContain("Invalid value");
  });
  it("a code other than 0 with HTTP 200 is also an error", async () => {
    const { client } = fakeZoho(() => ({ json: { code: 4, message: "Something" } }));
    await expect(client.createPurchaseOrder(PAYLOAD)).rejects.toMatchObject({ answered: true });
  });
  it("no answer at all (network failure) is 'not answered': we cannot know if it was created", async () => {
    const { client } = fakeZoho(() => "throw");
    const err = await client.createPurchaseOrder(PAYLOAD).catch((e) => e);
    expect(err).toBeInstanceOf(ZohoError);
    expect(err.answered).toBe(false);
  });
  it("finds a PO by its reference number, ignoring look-alikes", async () => {
    const { client } = fakeZoho(() => ({ json: { code: 0, purchaseorders: [{ purchaseorder_id: "A", purchaseorder_number: "1", status: "draft", reference_number: "FR-OTHER" }, { purchaseorder_id: "B", purchaseorder_number: "2", status: "draft", reference_number: "FR-ABC" }] } }));
    expect((await client.findPoByReference("FR-ABC"))?.purchaseorder_id).toBe("B");
    expect(await client.findPoByReference("FR-NONE")).toBeNull();
  });
  it("only an active vendor with the exact name matches", async () => {
    const { client } = fakeZoho(() => ({ json: { code: 0, contacts: [{ contact_id: "1", contact_name: "Freshroots Default Vendor Old", status: "active" }, { contact_id: "2", contact_name: "freshroots default vendor", status: "inactive" }, { contact_id: "3", contact_name: "Freshroots Default Vendor", status: "active" }] } }));
    expect((await client.findVendorByName("Freshroots Default Vendor"))?.contact_id).toBe("3");
  });
  it("sign-in failure is reported without leaking secrets", async () => {
    const c = new ZohoClient(ENV, (async () => new Response(JSON.stringify({ error: "invalid_code" }), { status: 400 })) as typeof fetch);
    const err = await c.listItems().catch((e) => e);
    expect(err.message).toContain("invalid_code");
    for (const secret of ["csecret", "rtoken"]) expect(err.message).not.toContain(secret);
  });
});

describe("configuration", () => {
  it("reports exactly which Zoho settings are missing", () => {
    expect(() => zohoEnv({ ZOHO_CLIENT_ID: "x" } as never)).toThrow(/ZOHO_CLIENT_SECRET.*ZOHO_REFRESH_TOKEN/);
  });
  it("ZOHO_DRY_RUN defaults to off and turns on only for 'true'", () => {
    expect(isDryRun({} as never)).toBe(false);
    expect(isDryRun({ ZOHO_DRY_RUN: "false" } as never)).toBe(false);
    expect(isDryRun({ ZOHO_DRY_RUN: " TRUE " } as never)).toBe(true);
  });
});

describe("a PO can never be issued, sent or approved by this code", () => {
  const dir = path.join(process.cwd(), "src");
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) && files.push(path.join(d, e.name))));
  walk(dir);
  it("no source file mentions a status-changing Zoho endpoint", () => {
    const forbidden = [/status\/issued/i, /status\/cancel/i, /purchaseorders\/[^"'`]*\/(submit|approve|reject)/i, /purchaseorders\/(submit|approve)/i, /markasissued/i, /\/sent\b/i, /status\/open/i];
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments may say what we avoid
      for (const re of forbidden) if (re.test(text)) hits.push(`${path.relative(dir, f)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
  it("the only POST path the client uses is /purchaseorders", () => {
    const text = readFileSync(path.join(dir, "lib/zoho/client.ts"), "utf8");
    expect([...text.matchAll(/request<[^>]*>\("POST",\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["purchaseorders"]);
  });
});
