import { logout } from "./actions";
import { Tabs } from "./_components/Tabs";
import { KillSwitchBanner } from "./_components/KillSwitchBanner";
import { DraftPoPanel } from "./_components/DraftPoPanel";
import { RunControls } from "./_components/RunControls";
import { DecisionButtons } from "./_components/DecisionButtons";
import { getDashboardData, type FlagRow } from "@/lib/dashboard";
import { getKillSwitchStatus } from "@/lib/killSwitch";
import { REJECTION_LABELS, REJECTION_REASONS } from "@/lib/decisions";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // a run can take about 1-2 minutes (grounded searches are slow)

const FLAG_LABEL: Record<string, string> = {
  HIGH_DEMAND: "High demand",
  STOCKOUT_RISK: "Stockout risk",
  OVERSTOCK_RISK: "Overstock risk",
};
const ISSUE_LABEL: Record<string, string> = {
  MISSING_INVENTORY: "Missing stock data",
  NO_SALES: "No sales data",
  SHORT_HISTORY: "Short sales history",
  SALES_GAP: "Gap in sales weeks",
  STALE_INVENTORY: "Stale stock data",
  STALE_SALES: "Stale sales data",
};

const n1 = (x: number | null) => (x === null ? "n/a" : x.toFixed(1));

function numbersLine(r: FlagRow): string {
  const m = r.metrics;
  if (m.cover === null) return "";
  const parts = [
    `Stock cover ${n1(m.cover)} weeks (limits ${m.minCover}-${m.maxCover})${m.festivalApplied ? ", festival uplift applied" : ""}`,
    `last 4 weeks avg ${n1(m.avg4)} vs 12-week avg ${n1(m.avg12)}`,
  ];
  return parts.join(" · ");
}

function actionText(r: FlagRow): string {
  if (r.action === "ORDER_NOW") return `Order now, quantity ${r.quantity}`;
  if (r.action === "PAUSE_ORDER") return "Pause the next order";
  return "Needs your judgment";
}

function Row({ r }: { r: FlagRow }) {
  const reasons = REJECTION_REASONS.map((value) => ({ value, label: REJECTION_LABELS[value] }));
  return (
    <div className="row">
      <div>
        <div className="sku">
          {r.skuId} · {r.skuName}
        </div>
        <div className="meta">{r.category}</div>
      </div>
      <div>
        <div>
          {r.flags.map((f) => (
            <span key={f} className="badge warn">
              {FLAG_LABEL[f] ?? f}
            </span>
          ))}
          {r.dataIssues.map((i) => (
            <span key={i} className="badge bad">
              {ISSUE_LABEL[i] ?? i}
            </span>
          ))}
        </div>
        <div>
          <strong>{actionText(r)}</strong>
          {r.reviewRequired && <span className="badge"> review: demand rising, stock healthy</span>}
        </div>
        {r.action === "NEEDS_RAGHAV" && r.needsRaghavReason && <div className="meta">{r.needsRaghavReason}</div>}
        {r.reason && <div>{r.reason}</div>}
        {r.aiNeedsRaghav && (
          <div className="aitriage">
            <span className="badge warn">AI suggests a closer look</span>
            {r.aiTriageReason ?? ""}
          </div>
        )}
        <div className="numbers">{numbersLine(r)}</div>
      </div>
      <div>
        {r.status === "APPROVED" && <span className="badge ok">Approved</span>}
        {r.status === "REJECTED" && (
          <span className="badge bad">
            Rejected: {REJECTION_LABELS[r.rejectionReason as keyof typeof REJECTION_LABELS] ?? r.rejectionReason}
          </span>
        )}
        {r.status === "PENDING" && r.action === "NEEDS_RAGHAV" && <span className="badge">Your call, no buttons</span>}
        {r.status === "PENDING" && r.action !== "NEEDS_RAGHAV" && <span className="badge">Waiting for you</span>}
      </div>
      <div>{r.status === "PENDING" && r.action !== "NEEDS_RAGHAV" && <DecisionButtons id={r.id} reasons={reasons} />}</div>
    </div>
  );
}

export default async function Page() {
  const [{ run, rows, pendingCount }, ks] = await Promise.all([getDashboardData(), getKillSwitchStatus()]);
  return (
    <div className="wrap">
      <header className="top">
        <h1>Freshroots Demand Planning</h1>
        <form action={logout}>
          <button>Sign out</button>
        </form>
      </header>
      <Tabs active="flags" />

      <KillSwitchBanner status={ks} />
      {run && (run.aiStatus === "failed" || run.aiStatus === "skipped" || run.aiStatus === "partial") && (
        <div className="notice">
          {run.aiStatus === "partial"
            ? "Some AI reasons are missing for this run. The flags and numbers are unaffected."
            : "AI reasons are unavailable for this run. The flags, numbers and actions are unaffected."}
        </div>
      )}

      <div className="bar">
        <div className="meta">
          {run ? (
            <>
              Run #{run.id} ({run.trigger}) · data as of {run.asOf}
              {run.festivalMonth ? " · festival month, 25% uplift applied" : ""} · finished{" "}
              {new Date(run.finishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            </>
          ) : (
            "No run yet."
          )}
        </div>
        <RunControls pendingCount={pendingCount} stopped={ks.stopped} />
      </div>

      <DraftPoPanel stopped={ks.stopped} />

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">{run ? "No flags in the latest run." : "Press Run now to create the first flag list."}</div>
        ) : (
          rows.map((r) => <Row key={r.id} r={r} />)
        )}
      </div>
      <p className="meta">Reasons are written by AI from the calculated numbers; the rules calculate every number, flag and quantity.</p>
      <p className="meta">Drafts only. Nothing here places, sends or confirms a purchase order.</p>
    </div>
  );
}
