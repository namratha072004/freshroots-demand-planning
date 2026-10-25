import { afterEach, describe, expect, it, vi } from "vitest";
import { DB_REQUEST_TIMEOUT_MS } from "@/lib/db";
import { neonConfig } from "@neondatabase/serverless";

afterEach(() => vi.restoreAllMocks());

describe("database request timeout", () => {
  it("every request gets a fresh abort signal, so a long run does not expire later requests", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => (seen.push(init?.signal ?? undefined), new Response("{}")));
    const f = neonConfig.fetchFunction as typeof fetch;
    await f("https://example.test/sql", {});
    await f("https://example.test/sql", {});
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[1]).toBeInstanceOf(AbortSignal);
    expect(seen[0]).not.toBe(seen[1]);
    expect(DB_REQUEST_TIMEOUT_MS).toBe(30_000);
    vi.unstubAllGlobals();
  });
  it("respects a signal the caller already supplied", async () => {
    const mine = new AbortController().signal;
    let got: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => ((got = init?.signal ?? undefined), new Response("{}")));
    await (neonConfig.fetchFunction as typeof fetch)("https://example.test/sql", { signal: mine });
    expect(got).toBe(mine);
    vi.unstubAllGlobals();
  });
});
