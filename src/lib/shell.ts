import { getSql } from "./db";
import { getAuthMode } from "./auth";
import { isDryRun } from "./zoho/client";
import { listDraftPos } from "./zoho/draftPo";

export type StepState = "done" | "warn" | "todo" | "off";
export interface PipelineStep {
  label: string;
  detail: string;
  state: StepState;
}

export interface ShellData {
  flagsToReview: number;
  leadsToReview: number;
  runLabel: string | null;
  steps: PipelineStep[];
  authMode: "open" | "password";
  dryRun: boolean;
  /** Latest draft POs created in Zoho, for the header glimpse. */
  pos: { number: string; status: string; createdAt: string; lines: string; url: string | null }[];
  /** Link to the Zoho purchase order list, when the organisation id is configured. */
  zohoListUrl: string | null;
}

/** Everything the sidebar shows: counts for the nav badges, the last run as a pipeline, and the current modes. */
export async function getShellData(): Promise<ShellData> {
  const sql = getSql();
  const [counts, runs, pos] = await Promise.all([
    sql`SELECT
      (SELECT count(*)::int FROM recommendations WHERE status = 'PENDING' AND action <> 'NEEDS_RAGHAV') AS flags,
      (SELECT count(*)::int FROM launch_leads WHERE mark IS NULL) AS leads,
      (SELECT count(*)::int FROM recommendations r WHERE r.status IN ('PENDING','APPROVED','REJECTED') AND r.run_id = (SELECT max(id) FROM runs WHERE status = 'completed')) AS total,
      (SELECT count(*)::int FROM recommendations r WHERE r.status IN ('APPROVED','REJECTED') AND r.run_id = (SELECT max(id) FROM runs WHERE status = 'completed')) AS decided,
      (SELECT count(*)::int FROM draft_purchase_orders WHERE status = 'created') AS pos`,
    sql`SELECT id, trigger, to_char(started_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH24:MI') AS at, ai_status, launch_status, launch_stats, summary
        FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`,
    listDraftPos(3),
  ]);
  const org = process.env.ZOHO_ORG_ID?.trim();
  const c = counts[0];
  const run = runs[0];
  const dryRun = isDryRun();

  const steps: PipelineStep[] = run
    ? (() => {
        const issues = Object.values((run.summary?.dataIssues ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
        const flags = (run.summary?.recommendations ?? 0) as number;
        const aiOk = run.ai_status === "ok";
        const kept = (run.launch_stats?.kept ?? 0) as number;
        const total = c.total as number;
        const decided = c.decided as number;
        return [
          { label: "Files read", detail: issues ? `${issues} data warning${issues === 1 ? "" : "s"}` : "Data checks clean", state: issues ? "warn" : "done" },
          { label: "Rules applied", detail: `${flags} flag${flags === 1 ? "" : "s"} raised`, state: "done" },
          { label: "AI reasons", detail: aiOk ? "Written and checked" : run.ai_status === "skipped" ? "Skipped" : run.ai_status ?? "Unavailable", state: aiOk ? "done" : "warn" },
          { label: "Launch search", detail: `${kept} sourced lead${kept === 1 ? "" : "s"}`, state: run.launch_status === "ok" || run.launch_status === "partial" ? "done" : "warn" },
          { label: "Your review", detail: total ? `${decided} of ${total} decided` : "Nothing to review", state: total > 0 && decided === total ? "done" : "todo" },
          { label: "Draft PO", detail: (c.pos as number) > 0 ? `${c.pos} created in Zoho` : dryRun ? "Dry run mode" : "None yet", state: (c.pos as number) > 0 ? "done" : "todo" },
        ] as PipelineStep[];
      })()
    : [];

  return {
    flagsToReview: c.flags as number,
    leadsToReview: c.leads as number,
    runLabel: run ? `Run #${run.id} · ${run.at} IST` : null,
    steps,
    authMode: getAuthMode(),
    dryRun,
    pos: pos
      .filter((p) => p.status === "created" && p.zohoPoNumber)
      .map((p) => ({
        number: p.zohoPoNumber as string,
        status: p.zohoStatus ?? "draft",
        createdAt: p.createdAt,
        lines: p.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", "),
        url: p.zohoPoId && org ? `https://inventory.zoho.in/app/${org}#/purchaseorders/${p.zohoPoId}` : null,
      })),
    zohoListUrl: org ? `https://inventory.zoho.in/app/${org}#/purchaseorders` : null,
  };
}
