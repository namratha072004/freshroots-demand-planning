import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runPlanning = vi.fn();
const query = vi.fn();
vi.mock("@/lib/run", () => ({ runPlanning: (...a: unknown[]) => runPlanning(...a) }));
vi.mock("@/lib/db", () => ({ getSql: () => () => query() }));

import { KillSwitchStoppedError } from "@/lib/killSwitch";
import { GET } from "@/app/api/cron/run/route";

const call = (auth?: string) => GET(new Request("https://x.test/api/cron/run", { headers: auth ? { authorization: auth } : {} }));
const env = { ...process.env };

beforeEach(() => {
  runPlanning.mockReset();
  query.mockReset().mockResolvedValue([]);
  process.env.CRON_SECRET = "s3cret-s3cret-s3cret";
});
afterEach(() => {
  process.env = { ...env };
});

describe("scheduled run endpoint", () => {
  it("rejects a request without the secret, and never starts a run", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("s3cret-s3cret-s3cret")).status).toBe(401); // must have the Bearer prefix
    expect(runPlanning).not.toHaveBeenCalled();
  });
  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect(runPlanning).not.toHaveBeenCalled();
  });
  it("runs as a 'cron' trigger with the right secret", async () => {
    runPlanning.mockResolvedValue({ runId: 7, asOf: "2026-10-19", recommendations: 7, ai: { status: "ok" }, launches: { status: "ok", kept: 5 }, timingsMs: {} });
    const res = await call("Bearer s3cret-s3cret-s3cret");
    expect(res.status).toBe(200);
    expect(runPlanning).toHaveBeenCalledWith("cron");
    expect(await res.json()).toMatchObject({ ok: true, runId: 7, recommendations: 7, ai: "ok", launches: { status: "ok", kept: 5 } });
  });
  it("a stopped kill switch refuses the scheduled run with 423", async () => {
    runPlanning.mockRejectedValue(new KillSwitchStoppedError());
    const res = await call("Bearer s3cret-s3cret-s3cret");
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ ok: false, refused: true });
  });
  it("a run already in progress is a 409, other failures a 500", async () => {
    runPlanning.mockRejectedValueOnce(new Error("A run is already in progress"));
    expect((await call("Bearer s3cret-s3cret-s3cret")).status).toBe(409);
    runPlanning.mockRejectedValueOnce(new Error("boom"));
    expect((await call("Bearer s3cret-s3cret-s3cret")).status).toBe(500);
  });
  it("a repeated delivery of the same schedule does not start a second run", async () => {
    query.mockResolvedValue([{ id: 41 }]);
    const res = await call("Bearer s3cret-s3cret-s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, runId: 41 });
    expect(runPlanning).not.toHaveBeenCalled();
  });
});
