"use client";

import { AlertTriangle, Check, ChevronRight, Hand, PackageOpen, PauseCircle, ShoppingCart, Sparkles, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import type { FlagRow } from "@/lib/dashboard";
import { REJECTION_LABELS, REJECTION_REASONS } from "@/lib/rejectionReasons";
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

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/**
 * One flag as a single line: product, action, stock cover, weekly sales, decision.
 * Click the row to open the detail (the full charts, the flags, the AI reason). Collapsed by default so the list stays calm.
 */
export function FlagRowCompact({ r, festivalPct, mode = "decide", showRun = false }: { r: FlagRow; festivalPct: number; mode?: "decide" | "decided"; showRun?: boolean }) {
  const [open, setOpen] = useState(false);
  const m = r.metrics;
  const reasons = REJECTION_REASONS.map((value) => ({ value, label: REJECTION_LABELS[value] }));
  const canDecide = mode === "decide" && r.status === "PENDING" && r.action !== "NEEDS_RAGHAV";
  const change = m.demandChange === null ? null : m.demandChange * 100;
  const hasCover = m.cover !== null && m.minCover !== null && m.maxCover !== null;

  return (
    <article className={`frow ${open ? "open" : ""} ${r.status !== "PENDING" ? "decided" : ""}`}>
      <div className="frow-main">
        <button className="frow-toggle ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} details for ${r.skuName}`}>
          <ChevronRight size={18} className="chev" />
        </button>

        <div className="fcell fcell-name" onClick={() => setOpen((v) => !v)}>
          <div className="flag-name">{r.skuName}</div>
          <div className="flag-meta">
            <span className="sku-id">{r.skuId}</span>
            {r.category && <span>· {r.category}</span>}
            {showRun && <span>· Run #{r.runId}</span>}
          </div>
        </div>

        <div className="fcell fcell-action">
          {r.action === "ORDER_NOW" && <span className="chip order"><ShoppingCart size={14} /> Order {r.quantity}</span>}
          {r.action === "PAUSE_ORDER" && <span className="chip pause"><PauseCircle size={14} /> Pause order</span>}
          {r.action === "NEEDS_RAGHAV" && <span className="chip hand"><Hand size={14} /> Your judgment</span>}
          {(r.reviewRequired || r.aiNeedsRaghav || r.dataIssues.length > 0) && (
            <span className="dotmark" title={r.reviewRequired ? "Review: demand rising, stock healthy" : r.aiNeedsRaghav ? "AI suggests a closer look" : "Data warning"} aria-label="Needs a closer look" />
          )}
        </div>

        <div className="fcell fcell-cover">
          {hasCover ? (
            <>
              <div className="fval">{m.cover!.toFixed(1)}<small> wk</small></div>
              <CoverMeter cover={m.cover!} min={m.minCover!} max={m.maxCover!} compact />
            </>
          ) : (
            <span className="muted">n/a</span>
          )}
        </div>

        <div className="fcell fcell-sales">
          <div className="fval">{m.avg4 === null ? "n/a" : Math.round(m.avg4)}<small> /wk</small></div>
          <Sparkline data={r.weekly} height={26} />
        </div>

        <div className="fcell fcell-decision">
          {canDecide && <DecisionButtons id={r.id} reasons={reasons} />}
          {r.status === "APPROVED" && <span className="chip ok"><Check size={14} strokeWidth={3} /> Approved</span>}
          {r.status === "REJECTED" && (
            <div className="decided-info">
              <span className="chip bad"><X size={14} strokeWidth={3} /> Rejected</span>
              <span className="muted">{REJECTION_LABELS[r.rejectionReason as keyof typeof REJECTION_LABELS] ?? r.rejectionReason}</span>
              {r.decidedAt && <span className="muted faintline">{when(r.decidedAt)} IST</span>}
            </div>
          )}
          {mode === "decide" && r.status === "PENDING" && r.action === "NEEDS_RAGHAV" && <span className="muted">Decided by you</span>}
        </div>
      </div>

      {open && (
        <div className="frow-detail">
          <div className="flag-chips" style={{ justifyContent: "flex-start" }}>
            {r.flags.includes("HIGH_DEMAND") && <span className="chip plain"><TrendingUp size={14} /> High demand</span>}
            {r.flags.includes("STOCKOUT_RISK") && <span className="chip plain"><AlertTriangle size={14} /> Stockout risk</span>}
            {r.flags.includes("OVERSTOCK_RISK") && <span className="chip plain"><PackageOpen size={14} /> Overstock risk</span>}
            {r.reviewRequired && <span className="chip warn">Review: demand up, stock healthy</span>}
            {r.dataIssues.map((i) => <span key={i} className="chip warn"><AlertTriangle size={14} /> {ISSUE_LABEL[i] ?? i}</span>)}
          </div>

          {hasCover && (
            <div className="viz">
              <div className="viz-block">
                <div className="viz-label">Weeks of cover</div>
                <div className="viz-value">{m.cover!.toFixed(1)} <small>wk{m.festivalApplied ? ` · festival +${festivalPct}%` : ""}</small></div>
                <CoverMeter cover={m.cover!} min={m.minCover!} max={m.maxCover!} />
                <div className="viz-foot">Safe zone {m.minCover} to {m.maxCover} weeks</div>
              </div>
              <div className="viz-block">
                <div className="viz-label">Weekly sales</div>
                <div className="viz-value">{m.avg4 === null ? "n/a" : Math.round(m.avg4)} <small>units/wk, last 4</small></div>
                <Sparkline data={r.weekly} />
                <div className="viz-foot">12-week average {m.avg12?.toFixed(1)}{change !== null && ` · ${change >= 0 ? "+" : ""}${change.toFixed(1)}% recent`}</div>
              </div>
            </div>
          )}

          {r.action === "NEEDS_RAGHAV" && r.needsRaghavReason && <div className="reason"><Hand size={16} /> <span>{r.needsRaghavReason}</span></div>}
          {r.reason ? (
            <div className="reason"><Sparkles size={16} /> <span>{r.reason}</span></div>
          ) : (
            r.action !== "NEEDS_RAGHAV" && <div className="reason muted"><Sparkles size={16} /> <span>No AI reason for this run. The numbers above come from the rules.</span></div>
          )}
          {r.aiNeedsRaghav && <div className="triage"><Hand size={16} /> <span><strong>AI suggests a closer look.</strong> {r.aiTriageReason ?? ""}</span></div>}
          {canDecide && <div className="muted" style={{ fontSize: 13 }}>Approving adds this to the draft PO. Nothing is sent.</div>}
        </div>
      )}
    </article>
  );
}
