import { Sparkles } from "lucide-react";
import { AppShell } from "./_components/AppShell";
import { KillSwitchBanner } from "./_components/KillSwitchBanner";
import { KpiStrip } from "./_components/KpiStrip";
import { NextSteps } from "./_components/NextSteps";
import { RunControls } from "./_components/RunControls";
import { loadBoard } from "@/lib/board";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // a run can take about 1-2 minutes (grounded searches are slow)

/** The overview: four numbers and what to do next. Each card opens its own page. */
export default async function Overview() {
  const { ks, shell, settings, festivalPct, run, rows, pendingCount } = await loadBoard();
  const aiProblem = run && (run.aiStatus === "failed" || run.aiStatus === "skipped" || run.aiStatus === "partial");

  return (
    <AppShell
      active="overview"
      title="Overview"
      shell={shell}
      subtitle={
        run ? (
          <>
            <span className="chip plain">Run #{run.id} · {run.trigger}</span>
            <span className="chip plain">Data as of {run.asOf}</span>
            {run.festivalMonth && <span className="chip plain">Festival month: +{festivalPct}% demand</span>}
            <span>Finished {new Date(run.finishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</span>
          </>
        ) : (
          "No run yet. Press Run now to create the first flag list."
        )
      }
      actions={<RunControls pendingCount={pendingCount} stopped={ks.stopped} />}
    >
      <KillSwitchBanner status={ks} limits={settings.killSwitch} />
      {aiProblem && (
        <div className="banner alert">
          <Sparkles size={20} style={{ flex: "none", marginTop: 1 }} />
          <div className="banner-body">
            {run.aiStatus === "partial" ? "Some AI reasons are missing for this run." : "AI reasons are unavailable for this run."} The flags, numbers and actions are unaffected.
          </div>
        </div>
      )}

      <KpiStrip rows={rows} pendingCount={pendingCount} ks={ks} dryRun={shell.dryRun} limits={settings.killSwitch} />
      <NextSteps pendingCount={pendingCount} leadsToReview={shell.leadsToReview} stopped={ks.stopped} />
      <p className="muted" style={{ fontSize: 13, marginTop: 22 }}>
        Click a card to open its list. Reasons are written by AI from the calculated numbers; the rules calculate every number, flag and quantity. Drafts only: nothing here places, sends or confirms a purchase order.
      </p>
    </AppShell>
  );
}
