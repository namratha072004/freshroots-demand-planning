import { Activity, Compass, FileCheck2, KeyRound, OctagonX, PlayCircle, ShieldAlert, SlidersHorizontal, ThumbsDown, ThumbsUp, Pencil } from "lucide-react";
import type { ActivityEntry, ActivityKind } from "@/lib/activity";
import { DeltaChip } from "./DeltaChip";

const ICON: Record<ActivityKind, React.ReactNode> = {
  "decision.approved": <ThumbsUp size={16} />,
  "decision.rejected": <ThumbsDown size={16} />,
  "quantity.adjusted": <Pencil size={16} />,
  "run.completed": <PlayCircle size={16} />,
  "run.failed": <OctagonX size={16} />,
  "po.created": <FileCheck2 size={16} />,
  "po.dry_run": <FileCheck2 size={16} />,
  "po.rechecked": <FileCheck2 size={16} />,
  "po.failed": <OctagonX size={16} />,
  "po.mode": <SlidersHorizontal size={16} />,
  "killswitch.stopped": <ShieldAlert size={16} />,
  "killswitch.resumed": <ShieldAlert size={16} />,
  "lead.marked": <Compass size={16} />,
  "settings.changed": <SlidersHorizontal size={16} />,
  "settings.reset": <SlidersHorizontal size={16} />,
  "session.login": <KeyRound size={16} />,
  "session.logout": <KeyRound size={16} />,
};
const TONE: Partial<Record<ActivityKind, string>> = {
  "decision.approved": "ok",
  "decision.rejected": "bad",
  "quantity.adjusted": "warn",
  "run.failed": "bad",
  "po.failed": "bad",
  "killswitch.stopped": "bad",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dayLabel = (iso: string) => {
  const d = day(iso);
  const today = day(new Date().toISOString());
  const yesterday = day(new Date(Date.now() - 86_400_000).toISOString());
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** The log as a timeline, newest first, grouped by day. */
export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  const groups: { label: string; items: ActivityEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return (
    <div className="timeline">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="tl-day">{g.label}</h3>
          <ol className="tl-list">
            {g.items.map((e) => {
              const d = e.details as { suggested?: number; ordered?: number };
              const showDelta = (e.kind === "decision.approved" || e.kind === "quantity.adjusted") && typeof d.suggested === "number" && typeof d.ordered === "number" && d.suggested !== d.ordered;
              return (
                <li key={e.id} className="tl-item">
                  <span className={`tl-icon ${TONE[e.kind] ?? ""}`}>{ICON[e.kind] ?? <Activity size={16} />}</span>
                  <div className="tl-body">
                    <div className="tl-summary">{e.summary}</div>
                    <div className="tl-meta">
                      <span className={`chip ${e.actor === "planner" ? "ok" : "plain"}`}>{e.actorLabel}</span>
                      {e.skuId && <span className="sku-id">{e.skuId}</span>}
                      {e.runId && <span className="muted">Run #{e.runId}</span>}
                      {showDelta && <DeltaChip suggested={d.suggested!} chosen={d.ordered!} />}
                    </div>
                  </div>
                  <time className="tl-time" dateTime={e.at}>{time(e.at)}</time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
