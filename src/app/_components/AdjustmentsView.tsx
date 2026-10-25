import { ArrowRight } from "lucide-react";
import { ADJUSTMENT_LABELS, ADJUSTMENT_REASONS } from "@/lib/adjustmentReasons";
import type { AdjustmentRow, AdjustmentStats } from "@/lib/adjustments";
import { DeltaChip } from "./DeltaChip";
import { SummaryStrip } from "./SummaryStrip";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const signed = (n: number, suffix = "") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-IN")}${suffix}`;

/** Where, and why, the planner's numbers differ from what the rules suggested. */
export function AdjustmentsView({ rows, stats, agreed, approvedOrders }: { rows: AdjustmentRow[]; stats: AdjustmentStats; agreed: number; approvedOrders: number }) {
  const agreePct = approvedOrders ? Math.round((agreed / approvedOrders) * 100) : null;
  return (
    <>
      <SummaryStrip
        items={[
          { label: "Agreed with the system", value: agreePct === null ? "n/a" : `${agreePct}%`, note: `${agreed} of ${approvedOrders} approved orders were taken as suggested` },
          { label: "Adjusted orders", value: stats.adjusted, note: `${stats.lowered} lowered · ${stats.raised} raised` },
          { label: "Typical size of change", value: `${stats.averageSizePercent}%`, note: "away from the suggested quantity, up or down" },
          { label: "Net units", value: signed(stats.netUnits), note: stats.netUnits < 0 ? "ordered less than suggested" : stats.netUnits > 0 ? "ordered more than suggested" : "no net change" },
        ]}
      />

      {rows.length === 0 ? (
        <div className="card empty section">
          <div>No quantity has been changed yet. When you edit an order, the system&apos;s number, yours and your reason appear here.</div>
        </div>
      ) : (
        <>
          <div className="tabs-row">
            {ADJUSTMENT_REASONS.map((r) => (
              <span key={r} className={`chip ${stats.byReason[r] ? "warn" : "plain"}`}>{ADJUSTMENT_LABELS[r]} · {stats.byReason[r]}</span>
            ))}
          </div>

          <div className="section">
            <div className="section-head"><h2>Orders where you changed the number</h2><span className="count">{rows.length}</span></div>
            <div className="card adjtable">
              <div className="adj-head" aria-hidden>
                <span>Product</span><span>System → You</span><span>Difference</span><span>Reason</span><span>When</span>
              </div>
              {rows.map((r) => (
                <div key={r.recommendationId} className="adj-row">
                  <div>
                    <div className="flag-name">{r.skuName}</div>
                    <div className="flag-meta"><span className="sku-id">{r.skuId}</span><span>· Run #{r.runId}</span>{r.inPo && <span>· in a draft PO</span>}</div>
                  </div>
                  <div className="adj-nums"><span className="muted">{r.suggested.toLocaleString("en-IN")}</span> <ArrowRight size={14} /> <b>{r.chosen.toLocaleString("en-IN")}</b></div>
                  <div><DeltaChip suggested={r.suggested} chosen={r.chosen} /></div>
                  <div>
                    <div>{r.reason ? ADJUSTMENT_LABELS[r.reason as keyof typeof ADJUSTMENT_LABELS] ?? r.reason : <span className="muted">not recorded</span>}</div>
                    {r.note && <div className="muted" style={{ fontSize: 13 }}>{r.note}</div>}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{when(r.lastChangedAt)} IST{r.changes > 1 ? ` · ${r.changes} changes` : ""}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-head"><h2>By SKU</h2><span className="section-note">Which products the rules get least right</span></div>
            <div className="card adjtable">
              <div className="adj-head sku" aria-hidden><span>Product</span><span>Times changed</span><span>Average change</span><span>Net units</span></div>
              {stats.bySku.map((s) => (
                <div key={s.skuId} className="adj-row sku">
                  <div><div className="flag-name">{s.skuName}</div><div className="flag-meta"><span className="sku-id">{s.skuId}</span></div></div>
                  <div><b>{s.count}</b></div>
                  <div>{signed(s.averagePercent, "%")}</div>
                  <div>{signed(s.netUnits)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
