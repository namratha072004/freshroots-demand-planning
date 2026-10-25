import { CheckCheck, OctagonX } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../_components/AppShell";
import { FlagTable } from "../_components/FlagTable";
import { SummaryStrip } from "../_components/SummaryStrip";
import { loadBoard } from "@/lib/board";
import { REJECTION_LABELS, REJECTION_REASONS } from "@/lib/rejectionReasons";
import { pickRows, reasonBreakdown } from "@/lib/views";

export const dynamic = "force-dynamic";

/** Rejections: every rejection in the kill-switch window (across runs), with the reason you gave. Approved ones are one click away. */
export default async function RejectionsPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const sp = await searchParams;
  const showApproved = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === "approved";
  const { ks, shell, settings, festivalPct, rows, decided } = await loadBoard();
  const rejected = pickRows("rejected", rows, decided);
  const approved = pickRows("approved", rows, decided);
  const list = showApproved ? approved : rejected;
  const reasons = reasonBreakdown(rejected);
  const e = ks.evaluation;
  const w = settings.killSwitch.windowWeeks;

  return (
    <AppShell
      active="rejections"
      title={showApproved ? "Approvals" : "Rejections"}
      back={{ href: "/", label: "Overview" }}
      shell={shell}
      subtitle={`Decisions from the last ${w} ${w === 1 ? "week" : "weeks"}, the same ones the rejection rate counts. Includes earlier runs.`}
    >
      <SummaryStrip
        items={[
          { label: "Rejection rate", value: e.rate === null ? "n/a" : `${(e.rate * 100).toFixed(1)}%`, note: e.collecting ? `Collecting data: ${e.decided} of ${settings.killSwitch.minDecisions} decisions` : `${e.rejected} of ${e.decided} decisions` },
          { label: "Rejected", value: rejected.length },
          { label: "Approved", value: approved.length },
        ]}
      />

      <div className="tabs-row">
        <Link href="/rejections" className={`filter-chip ${!showApproved ? "on" : ""}`}>Rejected <span className="filter-count">{rejected.length}</span></Link>
        <Link href="/rejections?show=approved" className={`filter-chip ${showApproved ? "on" : ""}`}>Approved <span className="filter-count">{approved.length}</span></Link>
        {!showApproved && rejected.length > 0 && (
          <span className="reason-split">
            {REJECTION_REASONS.map((r) => <span key={r} className="chip bad">{REJECTION_LABELS[r]} · {reasons[r] ?? 0}</span>)}
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card empty section">
          {showApproved ? <CheckCheck size={30} /> : <OctagonX size={30} />}
          <div>{showApproved ? "Nothing has been approved in this period." : "Nothing has been rejected in this period."}</div>
        </div>
      ) : (
        <div className="section">
          <FlagTable rows={list} festivalPct={festivalPct} mode="decided" showRun decisionLabel={showApproved ? "Decided" : "Why rejected"} />
        </div>
      )}
    </AppShell>
  );
}
