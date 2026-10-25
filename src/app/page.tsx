import { CheckCheck, Hand, PauseCircle, ShoppingCart, Sparkles, X } from "lucide-react";
import { AppShell } from "./_components/AppShell";
import { DraftPoPanel } from "./_components/DraftPoPanel";
import { FilterBar } from "./_components/FilterBar";
import { FlagCard } from "./_components/FlagCard";
import { KillSwitchBanner } from "./_components/KillSwitchBanner";
import { KpiStrip } from "./_components/KpiStrip";
import { RunControls } from "./_components/RunControls";
import { getDashboardData, type FlagRow } from "@/lib/dashboard";
import { getKillSwitchStatus } from "@/lib/killSwitch";
import { loadSettings } from "@/lib/settings";
import { getShellData } from "@/lib/shell";
import { orderTotals, parseView, pickRows, reasonBreakdown, viewCounts } from "@/lib/views";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // a run can take about 1-2 minutes (grounded searches are slow)

function Group({ icon, title, note, rows, festivalPct }: { icon: React.ReactNode; title: string; note: string; rows: FlagRow[]; festivalPct: number }) {
  if (rows.length === 0) return null;
  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        {icon}
        <h2>{title}</h2>
        <span className="count">{rows.length}</span>
        <span className="section-note">{note}</span>
      </div>
      <div className="flags">
        {rows.map((r) => (
          <FlagCard key={r.id} r={r} festivalPct={festivalPct} />
        ))}
      </div>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const view = parseView((await searchParams).view);
  const [ks, shell, settings] = await Promise.all([getKillSwitchStatus(), getShellData(), loadSettings()]);
  const { run, rows, decided, pendingCount } = await getDashboardData(ks.evaluation.windowStart);
  const festivalPct = Math.round(settings.rules.festivalUplift * 1000) / 10;
  const aiProblem = run && (run.aiStatus === "failed" || run.aiStatus === "skipped" || run.aiStatus === "partial");

  const counts = viewCounts(rows, decided);
  const shown = pickRows(view, rows, decided);
  const decidedView = view === "rejected" || view === "approved";

  return (
    <AppShell
      active="flags"
      title="Weekly flag review"
      shell={shell}
      subtitle={
        run ? (
          <>
            <span className="chip plain">Run #{run.id} · {run.trigger}</span>
            <span className="chip plain">Data as of {run.asOf}</span>
            {run.festivalMonth && <span className="chip plain">Festival month: +{festivalPct}% demand</span>}
            <span>
              Finished {new Date(run.finishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST
            </span>
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

      <KpiStrip rows={rows} pendingCount={pendingCount} ks={ks} dryRun={shell.dryRun} limits={settings.killSwitch} view={view} />
      <DraftPoPanel stopped={ks.stopped} />

      <div style={{ marginTop: 26 }}>
        <FilterBar
          view={view}
          counts={counts}
          windowWeeks={settings.killSwitch.windowWeeks}
          reasons={reasonBreakdown(pickRows("rejected", rows, decided))}
          totals={orderTotals(rows)}
        />
      </div>

      {shown.length === 0 ? (
        <div className="card empty section">
          <CheckCheck size={30} />
          <div>
            {view === "rejected" ? "Nothing has been rejected in this period." : view === "approved" ? "Nothing has been approved in this period." : view === "pending" ? "Nothing is waiting for review. Everything is answered." : view === "orders" ? "There are no proposed orders." : run ? "No flags in the latest run." : "Nothing to review yet."}
          </div>
        </div>
      ) : decidedView ? (
        <section className="section" aria-label={view === "rejected" ? "Rejected" : "Approved"}>
          <div className="section-head">
            {view === "rejected" ? <X size={18} /> : <CheckCheck size={18} />}
            <h2>{view === "rejected" ? "Rejected" : "Approved"}</h2>
            <span className="count">{shown.length}</span>
            <span className="section-note">Newest first</span>
          </div>
          <div className="flags">
            {shown.map((r) => (
              <FlagCard key={r.id} r={r} festivalPct={festivalPct} showRun />
            ))}
          </div>
        </section>
      ) : (
        <>
          <Group icon={<ShoppingCart size={18} />} title="Order now" note="Approve to add to the draft PO" rows={shown.filter((r) => r.action === "ORDER_NOW")} festivalPct={festivalPct} />
          <Group icon={<PauseCircle size={18} />} title="Pause the next order" note="Approving records the decision; no PO is created" rows={shown.filter((r) => r.action === "PAUSE_ORDER")} festivalPct={festivalPct} />
          <Group icon={<Hand size={18} />} title="Needs your judgment" note="Outside the rules" rows={shown.filter((r) => r.action === "NEEDS_RAGHAV")} festivalPct={festivalPct} />
        </>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 28 }}>
        Reasons are written by AI from the calculated numbers; the rules calculate every number, flag and quantity. Drafts only: nothing here places, sends or confirms a purchase order.
      </p>
    </AppShell>
  );
}
