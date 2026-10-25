import { getSql } from "./db";

export type LeadMark = "interested" | "ignore";

export interface LeadRow {
  id: number;
  category: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceSite: string | null;
  sourceDate: string;
  mark: LeadMark | null;
}

export interface LaunchesData {
  leads: LeadRow[];
  lastRun: { id: number; launchStatus: string | null; launchError: string | null; stats: { searches?: number; kept?: number; candidates?: number } | null } | null;
}

export function parseLeadMark(v: unknown): LeadMark {
  if (v === "interested" || v === "ignore") return v;
  throw new Error("Mark must be interested or ignore");
}

export async function getLaunchesData(): Promise<LaunchesData> {
  const sql = getSql();
  const [leads, runs] = await Promise.all([
    sql`SELECT id, category, title, summary, source_url, source_site, to_char(source_date, 'YYYY-MM-DD') AS source_date, mark
        FROM launch_leads ORDER BY (mark IS NOT NULL), source_date DESC, id DESC`,
    sql`SELECT id, launch_status, launch_error, launch_stats FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`,
  ]);
  return {
    leads: leads.map((l) => ({
      id: Number(l.id),
      category: l.category as string,
      title: l.title as string,
      summary: l.summary as string,
      sourceUrl: l.source_url as string,
      sourceSite: l.source_site as string | null,
      sourceDate: l.source_date as string,
      mark: l.mark as LeadMark | null,
    })),
    lastRun: runs.length
      ? {
          id: Number(runs[0].id),
          launchStatus: runs[0].launch_status as string | null,
          launchError: runs[0].launch_error as string | null,
          stats: runs[0].launch_stats as LaunchesData["lastRun"] extends infer R ? (R extends { stats: infer S } ? S : never) : never,
        }
      : null,
  };
}

export async function markLead(id: number, mark: unknown): Promise<void> {
  const m = parseLeadMark(mark);
  const sql = getSql();
  const rows = await sql`UPDATE launch_leads SET mark = ${m}, marked_at = now() WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new Error("Lead not found");
}
