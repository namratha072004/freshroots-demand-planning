import { config } from "@/config";
import { getSql } from "./db";

export type Actor = "planner" | "system";

export type ActivityKind =
  | "decision.approved"
  | "decision.rejected"
  | "quantity.adjusted"
  | "run.completed"
  | "run.failed"
  | "po.created"
  | "po.dry_run"
  | "po.rechecked"
  | "po.failed"
  | "po.mode"
  | "killswitch.stopped"
  | "killswitch.resumed"
  | "lead.marked"
  | "settings.changed"
  | "settings.reset"
  | "session.login"
  | "session.logout";

/** The filter chips on the log page. */
export const ACTIVITY_GROUPS = {
  decisions: { label: "Decisions", kinds: ["decision.approved", "decision.rejected", "quantity.adjusted"] },
  runs: { label: "Runs", kinds: ["run.completed", "run.failed"] },
  pos: { label: "Purchase orders", kinds: ["po.created", "po.dry_run", "po.rechecked", "po.failed", "po.mode"] },
  safety: { label: "Kill switch", kinds: ["killswitch.stopped", "killswitch.resumed"] },
  launches: { label: "Launches", kinds: ["lead.marked"] },
  settings: { label: "Settings", kinds: ["settings.changed", "settings.reset"] },
  access: { label: "Sign in / out", kinds: ["session.login", "session.logout"] },
} as const satisfies Record<string, { label: string; kinds: readonly ActivityKind[] }>;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export interface ActivityEntry {
  id: number;
  at: string;
  actor: Actor;
  /** The name shown for the planner (the dashboard has one login, so every dashboard action is attributed to this name). */
  actorLabel: string;
  kind: ActivityKind;
  summary: string;
  details: Record<string, unknown>;
  skuId: string | null;
  recommendationId: number | null;
  runId: number | null;
}

export interface NewActivity {
  kind: ActivityKind;
  summary: string;
  actor?: Actor;
  details?: Record<string, unknown>;
  skuId?: string | null;
  recommendationId?: number | null;
  runId?: number | null;
}

/** Record one action. Logging must never break the action it describes, so a failure here is swallowed. */
export async function logActivity(a: NewActivity): Promise<void> {
  try {
    await getSql()`INSERT INTO activity_log (actor, kind, summary, details, sku_id, recommendation_id, run_id)
      VALUES (${a.actor ?? "planner"}, ${a.kind}, ${a.summary}, ${JSON.stringify(a.details ?? {})}::jsonb, ${a.skuId ?? null}, ${a.recommendationId ?? null}, ${a.runId ?? null})`;
  } catch {
    // best effort
  }
}

const label = (actor: Actor) => (actor === "planner" ? config.ui.plannerName : "System");

export async function listActivity(opts: { group?: ActivityGroup | null; actor?: Actor | null; limit?: number } = {}): Promise<{ entries: ActivityEntry[]; total: number }> {
  const sql = getSql();
  const kinds = opts.group ? [...ACTIVITY_GROUPS[opts.group].kinds] : null;
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);
  const [rows, count] = await Promise.all([
    sql`SELECT id, at, actor, kind, summary, details, sku_id, recommendation_id, run_id FROM activity_log
        WHERE (${kinds}::text[] IS NULL OR kind = ANY(${kinds}::text[])) AND (${opts.actor ?? null}::text IS NULL OR actor = ${opts.actor ?? null})
        ORDER BY at DESC, id DESC LIMIT ${limit}`,
    sql`SELECT count(*)::int AS n FROM activity_log
        WHERE (${kinds}::text[] IS NULL OR kind = ANY(${kinds}::text[])) AND (${opts.actor ?? null}::text IS NULL OR actor = ${opts.actor ?? null})`,
  ]);
  return {
    entries: rows.map((r) => ({
      id: Number(r.id),
      at: new Date(r.at as string).toISOString(),
      actor: r.actor as Actor,
      actorLabel: label(r.actor as Actor),
      kind: r.kind as ActivityKind,
      summary: r.summary as string,
      details: (r.details ?? {}) as Record<string, unknown>,
      skuId: r.sku_id as string | null,
      recommendationId: r.recommendation_id === null ? null : Number(r.recommendation_id),
      runId: r.run_id === null ? null : Number(r.run_id),
    })),
    total: count[0].n as number,
  };
}

/** How many entries each group has, for the filter chips. */
export async function activityCounts(): Promise<Record<ActivityGroup | "all", number>> {
  const rows = await getSql()`SELECT kind, count(*)::int AS n FROM activity_log GROUP BY kind`;
  const byKind = new Map(rows.map((r) => [r.kind as string, r.n as number]));
  const out = { all: rows.reduce((s, r) => s + (r.n as number), 0) } as Record<ActivityGroup | "all", number>;
  for (const [g, def] of Object.entries(ACTIVITY_GROUPS)) out[g as ActivityGroup] = def.kinds.reduce((s, k) => s + (byKind.get(k) ?? 0), 0);
  return out;
}
