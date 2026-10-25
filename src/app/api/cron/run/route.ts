import { timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { KillSwitchStoppedError } from "@/lib/killSwitch";
import { runPlanning } from "@/lib/run";

// A run takes about 1-2 minutes (real web searches are slow). Vercel allows up to 300 s with Fluid compute.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** A scheduled run that started less than this long ago means Vercel delivered the same schedule twice. */
const DUPLICATE_WINDOW_MINUTES = 30;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured means nobody gets in
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>` (Mon and Thu 08:00 IST, see vercel.json). */
export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    // Cron delivery is best effort and can repeat: do not run twice for one schedule.
    const recent = await getSql()`SELECT id FROM runs WHERE trigger = 'cron' AND started_at > now() - make_interval(mins => ${DUPLICATE_WINDOW_MINUTES}) LIMIT 1`;
    if (recent.length > 0) return Response.json({ ok: true, skipped: "a scheduled run already started in the last 30 minutes", runId: Number(recent[0].id) });

    const s = await runPlanning("cron");
    return Response.json({
      ok: true,
      runId: s.runId,
      asOf: s.asOf,
      recommendations: s.recommendations,
      ai: s.ai?.status,
      launches: s.launches ? { status: s.launches.status, kept: s.launches.kept } : undefined,
      timingsMs: s.timingsMs,
    });
  } catch (e) {
    // A stopped kill switch blocks the scheduled run: report it clearly, it is not an error in the app.
    if (e instanceof KillSwitchStoppedError) return Response.json({ ok: false, refused: true, reason: e.message }, { status: 423 });
    const message = e instanceof Error ? e.message : String(e);
    if (message === "A run is already in progress") return Response.json({ ok: false, error: message }, { status: 409 });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
