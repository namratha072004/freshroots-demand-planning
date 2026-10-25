import { AlertTriangle, Check, Hand, PackageOpen, PauseCircle, ShoppingCart, Sparkles, TrendingUp, X } from "lucide-react";
import type { FlagRow } from "@/lib/dashboard";
import { REJECTION_LABELS, REJECTION_REASONS } from "@/lib/decisions";
import { CoverMeter } from "./CoverMeter";
import { DecisionButtons } from "./DecisionButtons";
import { Sparkline } from "./Sparkline";

const ISSUE_LABEL: Record<string, string> = {
  MISSING_INVENTORY: "Missing stock data",
  NO_SALES: "No sales data",
  SHORT_HISTORY: "Short sales history",
  SALES_GAP: "Gap in sales weeks",
  STALE_INVENTORY: "Stale stock data",
  STALE_SALES: "Stale sales data",
};

function FlagChips({ r }: { r: FlagRow }) {
  return (
    <div className="flag-chips">
      {r.action === "ORDER_NOW" && <span className="chip order"><ShoppingCart size={14} /> Order {r.quantity}</span>}
      {r.action === "PAUSE_ORDER" && <span className="chip pause"><PauseCircle size={14} /> Pause next order</span>}
      {r.action === "NEEDS_RAGHAV" && <span className="chip hand"><Hand size={14} /> Needs your judgment</span>}
      {r.flags.includes("HIGH_DEMAND") && <span className="chip plain"><TrendingUp size={14} /> High demand</span>}
      {r.flags.includes("STOCKOUT_RISK") && <span className="chip plain"><AlertTriangle size={14} /> Stockout risk</span>}
      {r.flags.includes("OVERSTOCK_RISK") && <span className="chip plain"><PackageOpen size={14} /> Overstock risk</span>}
      {r.reviewRequired && <span className="chip warn">Review: demand up, stock healthy</span>}
      {r.dataIssues.map((i) => <span key={i} className="chip warn"><AlertTriangle size={14} /> {ISSUE_LABEL[i] ?? i}</span>)}
    </div>
  );
}

/** One flag as a card: identity and action on top, the two charts the rules used, the AI reason, then the decision. */
export function FlagCard({ r, festivalPct, showRun = false }: { r: FlagRow; festivalPct: number; showRun?: boolean }) {
  const m = r.metrics;
  const reasons = REJECTION_REASONS.map((value) => ({ value, label: REJECTION_LABELS[value] }));
  const decided = r.status !== "PENDING";
  const canDecide = r.status === "PENDING" && r.action !== "NEEDS_RAGHAV";
  const change = m.demandChange === null ? null : m.demandChange * 100;

  return (
    <article className={`card flag ${decided ? "decided" : ""}`}>
      <div className="flag-top">
        <div>
          <div className="flag-name">{r.skuName}</div>
          <div className="flag-meta">
            <span className="sku-id">{r.skuId}</span>
            {r.category && <span>· {r.category}</span>}
            {showRun && <span>· Run #{r.runId}</span>}
            {showRun && r.decidedAt && <span>· decided {new Date(r.decidedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</span>}
          </div>
        </div>
        <FlagChips r={r} />
      </div>

      {m.cover !== null && m.minCover !== null && m.maxCover !== null && (
        <div className="viz">
          <div className="viz-block">
            <div className="viz-label">Weeks of cover</div>
            <div className="viz-value">{m.cover.toFixed(1)} <small>wk{m.festivalApplied ? ` · festival +${festivalPct}%` : ""}</small></div>
            <CoverMeter cover={m.cover} min={m.minCover} max={m.maxCover} />
            <div className="viz-foot">Safe zone {m.minCover} to {m.maxCover} weeks</div>
          </div>
          <div className="viz-block">
            <div className="viz-label">Weekly sales</div>
            <div className="viz-value">{m.avg4 === null ? "n/a" : Math.round(m.avg4)} <small>units/wk, last 4</small></div>
            <Sparkline data={r.weekly} />
            <div className="viz-foot">
              12-week average {m.avg12?.toFixed(1)}
              {change !== null && ` · ${change >= 0 ? "+" : ""}${change.toFixed(1)}% recent`}
            </div>
          </div>
        </div>
      )}

      {r.action === "NEEDS_RAGHAV" && r.needsRaghavReason && (
        <div className="reason"><Hand size={16} /> <span>{r.needsRaghavReason}</span></div>
      )}
      {r.reason ? (
        <div className="reason"><Sparkles size={16} /> <span>{r.reason}</span></div>
      ) : (
        r.action !== "NEEDS_RAGHAV" && <div className="reason muted"><Sparkles size={16} /> <span>No AI reason for this run. The numbers above come from the rules.</span></div>
      )}
      {r.aiNeedsRaghav && (
        <div className="triage"><Hand size={16} /> <span><strong>AI suggests a closer look.</strong> {r.aiTriageReason ?? ""}</span></div>
      )}

      <div className="flag-actions">
        {canDecide && <DecisionButtons id={r.id} reasons={reasons} />}
        {r.status === "APPROVED" && <span className="chip ok"><Check size={14} strokeWidth={3} /> Approved</span>}
        {r.status === "REJECTED" && (
          <span className="chip bad"><X size={14} strokeWidth={3} /> Rejected: {REJECTION_LABELS[r.rejectionReason as keyof typeof REJECTION_LABELS] ?? r.rejectionReason}</span>
        )}
        {!decided && r.action === "NEEDS_RAGHAV" && <span className="hint">Outside the rules: decided by you, not by the system.</span>}
        {canDecide && <span className="hint">Approving adds this to the draft PO. Nothing is sent.</span>}
      </div>
    </article>
  );
}
