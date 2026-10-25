"use client";

import { ExternalLink, FileCheck2, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { outcomeFromResult, type PoOutcome } from "@/lib/poOutcome";
import { createDraftPoAction } from "../actions";

type Line = { skuId: string; quantity: number };

/**
 * A bar fixed to the bottom of the review pages: the approved lines waiting for a draft PO and one Generate PO button, so a
 * planner who has just approved does not have to go to another page. It stays mounted after the PO is made so the result is visible.
 */
export function PoBar({ lines, stopped, dryRun, recheck, orgUrl }: { lines: Line[]; stopped: boolean; dryRun: boolean; recheck: boolean; orgUrl: string | null }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<PoOutcome | null>(null);

  const units = lines.reduce((s, l) => s + l.quantity, 0);
  if (lines.length === 0 && !recheck && !outcome) return null;

  const go = () =>
    start(async () => {
      setOutcome(null);
      const r = await createDraftPoAction();
      setConfirming(false);
      setOutcome(outcomeFromResult(r, orgUrl));
    });

  const done = outcome && (outcome.kind === "created" || outcome.kind === "existing");

  return (
    <aside className={`pobar ${done ? "done" : ""}`} aria-label="Generate a draft purchase order">
      {outcome?.kind === "created" || outcome?.kind === "existing" ? (
        <div className="pobar-main">
          <FileCheck2 size={20} />
          <div className="pobar-text">
            <strong>{outcome.kind === "created" ? `Draft PO ${outcome.number} created in Zoho.` : `Draft PO ${outcome.number} already exists, so no second one was made.`}</strong>
            <span className="muted"> It is a draft: procurement adds the price and places the order in Zoho.</span>
            {outcome.kind === "created" && outcome.warning && <div className="error">{outcome.warning}</div>}
          </div>
          {outcome.url && (
            <a className="btn" href={outcome.url} target="_blank" rel="noopener noreferrer">Open in Zoho <ExternalLink size={14} /></a>
          )}
          <button className="ghost" onClick={() => setOutcome(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      ) : (
        <>
          <div className="pobar-main">
            <FileCheck2 size={20} />
            <div className="pobar-text">
              {recheck ? (
                <strong>A draft PO did not finish. Check Zoho and finish it safely.</strong>
              ) : (
                <>
                  <strong>{lines.length} approved {lines.length === 1 ? "line is" : "lines are"} ready for a draft PO</strong>
                  <span className="pobar-lines">{lines.map((l) => `${l.skuId} × ${l.quantity.toLocaleString("en-IN")}`).join(", ")} · {units.toLocaleString("en-IN")} units</span>
                </>
              )}
              {dryRun && <span className="chip warn" style={{ marginLeft: 8 }}>Dry run</span>}
            </div>
            <div className="popwrap">
              <button className="primary" disabled={pending || stopped} title={stopped ? "Blocked by the kill switch" : undefined} onClick={() => setConfirming(true)}>
                {pending ? <Loader2 size={16} className="spin" /> : <FileCheck2 size={16} />}
                {pending ? "Working…" : recheck ? "Check Zoho and finish" : "Generate PO"}
              </button>
              {confirming && (
                <div className="card pop pobar-pop" role="dialog" aria-label="Confirm">
                  <p>
                    <strong>{dryRun ? "Dry run." : "Create a real draft purchase order in Zoho?"}</strong>{" "}
                    {dryRun
                      ? "Nothing will be created in Zoho. You will see the request that would be sent."
                      : `It has ${lines.length} ${lines.length === 1 ? "line" : "lines"} with SKU and your quantity, no price, and stays a draft. It is never sent or issued by this tool.`}
                  </p>
                  <div className="actions">
                    <button className="primary" disabled={pending} onClick={go}>{dryRun ? "Run dry run" : "Yes, generate it"}</button>
                    <button disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {stopped && <div className="error" style={{ padding: "0 16px 10px" }}>Blocked: the kill switch is stopped.</div>}
          {outcome?.kind === "error" && <div className="error" style={{ padding: "0 16px 10px" }}>{outcome.message}</div>}
          {outcome?.kind === "dry" && (
            <details className="pobar-dry">
              <summary>Dry run: would create 1 draft PO with {outcome.lines.length} {outcome.lines.length === 1 ? "line" : "lines"}. Nothing was sent to Zoho. Show the request</summary>
              <pre className="dry">{outcome.request}</pre>
            </details>
          )}
        </>
      )}
    </aside>
  );
}
