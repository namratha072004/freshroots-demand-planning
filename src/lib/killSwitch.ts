import { getSql } from "./db";
import { evaluateKillSwitch, type KillSwitchEvaluation } from "./killSwitchRules";
import { config } from "@/config";

export class KillSwitchStoppedError extends Error {
  constructor() {
    super("The kill switch is stopped: runs and draft POs are blocked until you resume with a note.");
    this.name = "KillSwitchStoppedError";
  }
}

export interface KillSwitchStatus {
  evaluation: KillSwitchEvaluation;
  stopped: boolean;
  stoppedAt: string | null;
  stopSummary: { approved: number; rejected: number; decided: number; rate: number | null } | null;
  lastResume: { at: string; note: string } | null;
}

/** Reads decisions and the stop latch. `now` is the real clock. */
export async function getKillSwitchStatus(now: Date = new Date()): Promise<KillSwitchStatus> {
  const sql = getSql();
  const [events, resumed, decisions] = await Promise.all([
    sql`SELECT kind, created_at, approved, rejected, decided, rate FROM kill_switch_events ORDER BY id DESC LIMIT 1`,
    sql`SELECT created_at, note FROM kill_switch_events WHERE kind = 'RESUMED' ORDER BY id DESC LIMIT 1`,
    sql`SELECT status, action, decided_at FROM recommendations
        WHERE status IN ('APPROVED', 'REJECTED') AND decided_at >= ${new Date(now.getTime() - config.killSwitch.windowWeeks * 7 * 86_400_000).toISOString()}`,
  ]);

  const lastResumedAt = resumed.length ? new Date(resumed[0].created_at as string) : null;
  const evaluation = evaluateKillSwitch(
    decisions.map((d) => ({
      status: d.status as string,
      action: d.action as string,
      decidedAt: d.decided_at ? new Date(d.decided_at as string) : null,
    })),
    now,
    lastResumedAt,
  );
  const stopped = events.length > 0 && events[0].kind === "STOPPED";
  return {
    evaluation,
    stopped,
    stoppedAt: stopped ? new Date(events[0].created_at as string).toISOString() : null,
    stopSummary: stopped
      ? {
          approved: events[0].approved as number,
          rejected: events[0].rejected as number,
          decided: events[0].decided as number,
          rate: events[0].rate === null ? null : Number(events[0].rate),
        }
      : null,
    lastResume: lastResumed(resumed),
  };
}

function lastResumed(rows: Record<string, unknown>[]) {
  return rows.length ? { at: new Date(rows[0].created_at as string).toISOString(), note: rows[0].note as string } : null;
}

/** Called after decisions are saved and before the next run or PO: latches a stop when the rate crosses the line. */
export async function evaluateAndLatch(now: Date = new Date()): Promise<KillSwitchStatus> {
  let status = await getKillSwitchStatus(now);
  if (!status.stopped && status.evaluation.wouldStop) {
    const e = status.evaluation;
    const sql = getSql();
    await sql`INSERT INTO kill_switch_events (kind, approved, rejected, decided, rate)
      SELECT 'STOPPED', ${e.approved}, ${e.rejected}, ${e.decided}, ${e.rate}
      WHERE coalesce((SELECT kind FROM kill_switch_events ORDER BY id DESC LIMIT 1), 'RESUMED') <> 'STOPPED'`;
    status = await getKillSwitchStatus(now);
  }
  return status;
}

/** Guard for scheduled runs, manual runs and "Create draft PO". Throws when stopped. */
export async function assertNotStopped(): Promise<void> {
  const status = await evaluateAndLatch();
  if (status.stopped) throw new KillSwitchStoppedError();
}

/** Resume after a stop. Needs a typed note, which is stored. Decisions before now stop counting. */
export async function resumeKillSwitch(note: string): Promise<void> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Type a note explaining why it is safe to resume");
  const sql = getSql();
  const rows = await sql`INSERT INTO kill_switch_events (kind, note)
    SELECT 'RESUMED', ${trimmed}
    WHERE (SELECT kind FROM kill_switch_events ORDER BY id DESC LIMIT 1) = 'STOPPED' RETURNING id`;
  if (rows.length === 0) throw new Error("The kill switch is not stopped");
}
