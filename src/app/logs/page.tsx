import { ScrollText } from "lucide-react";
import Link from "next/link";
import { ActivityTimeline } from "../_components/ActivityTimeline";
import { AdjustmentsView } from "../_components/AdjustmentsView";
import { AppShell } from "../_components/AppShell";
import { ACTIVITY_GROUPS, activityCounts, listActivity, type ActivityGroup, type Actor } from "@/lib/activity";
import { adjustmentStats, listAdjustments } from "@/lib/adjustments";
import { config } from "@/config";
import { getShellData } from "@/lib/shell";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Activity log: a time log of every action, and the Adjustments view (what the system suggested vs what you chose). */
export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = first(sp.tab) === "adjustments" ? "adjustments" : "activity";
  const g = first(sp.group);
  const group = g && g in ACTIVITY_GROUPS ? (g as ActivityGroup) : null;
  const who = first(sp.who);
  const actor: Actor | null = who === "planner" || who === "system" ? who : null;
  const limit = Math.min(Number(first(sp.limit)) || 60, 500);

  const shell = await getShellData();
  const q = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { tab: tab === "adjustments" ? "adjustments" : null, group, who: actor, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return `/logs${s ? `?${s}` : ""}`;
  };

  let body: React.ReactNode;
  if (tab === "adjustments") {
    const { rows, agreed, approvedOrders } = await listAdjustments();
    body = <AdjustmentsView rows={rows} stats={adjustmentStats(rows)} agreed={agreed} approvedOrders={approvedOrders} />;
  } else {
    const [{ entries, total }, counts] = await Promise.all([listActivity({ group, actor, limit }), activityCounts()]);
    body = (
      <>
        <div className="tabs-row" role="navigation" aria-label="Filter the log">
          <Link href={q({ group: null })} className={`filter-chip ${!group ? "on" : ""}`}>Everything <span className="filter-count">{counts.all}</span></Link>
          {(Object.keys(ACTIVITY_GROUPS) as ActivityGroup[]).map((k) => (
            <Link key={k} href={q({ group: k })} className={`filter-chip ${group === k ? "on" : ""}`}>{ACTIVITY_GROUPS[k].label} <span className="filter-count">{counts[k]}</span></Link>
          ))}
        </div>
        <div className="tabs-row" style={{ marginTop: 0 }}>
          <span className="muted" style={{ fontSize: 13 }}>Who:</span>
          <Link href={q({ who: null })} className={`filter-chip ${!actor ? "on" : ""}`}>Everyone</Link>
          <Link href={q({ who: "planner" })} className={`filter-chip ${actor === "planner" ? "on" : ""}`}>{config.ui.plannerName}</Link>
          <Link href={q({ who: "system" })} className={`filter-chip ${actor === "system" ? "on" : ""}`}>System</Link>
        </div>
        {entries.length === 0 ? (
          <div className="card empty section"><ScrollText size={30} /><div>Nothing has been logged for this filter yet.</div></div>
        ) : (
          <div className="card timeline-card section">
            <ActivityTimeline entries={entries} />
            {total > entries.length && (
              <div style={{ textAlign: "center", paddingTop: 14 }}>
                <Link href={q({ limit: String(limit + 100) })} className="btn">Show more ({total - entries.length} older)</Link>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell
      active="logs"
      title="Activity log"
      shell={shell}
      subtitle={tab === "adjustments" ? "What the system suggested, what you chose, and why, so you can see where the rules and your judgment differ." : `A time log of every action. Actions taken on the dashboard are shown as ${config.ui.plannerName}; things the app did by itself are shown as System. Times are IST.`}
    >
      <div className="tabs-row" style={{ marginTop: 0 }} role="tablist" aria-label="Log views">
        <Link href="/logs" role="tab" aria-selected={tab === "activity"} className={`filter-chip ${tab === "activity" ? "on" : ""}`}>Activity</Link>
        <Link href="/logs?tab=adjustments" role="tab" aria-selected={tab === "adjustments"} className={`filter-chip ${tab === "adjustments" ? "on" : ""}`}>Adjustments (system vs you)</Link>
      </div>
      {body}
    </AppShell>
  );
}
