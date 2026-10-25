import { Boxes, FileCheck2, Gauge, Inbox } from "lucide-react";
import { config } from "@/config";
import type { FlagRow } from "@/lib/dashboard";
import type { KillSwitchStatus } from "@/lib/killSwitch";
import { listDraftPos } from "@/lib/zoho/draftPo";
import { CountUp } from "./CountUp";
import { RateMeter } from "./RateMeter";

/** Four headline numbers. Hero figures are sentence-case labels over a 34px figure. */
export async function KpiStrip({ rows, pendingCount, ks, dryRun }: { rows: FlagRow[]; pendingCount: number; ks: KillSwitchStatus; dryRun: boolean }) {
  const pos = await listDraftPos(5);
  const created = pos.filter((p) => p.status === "created");
  const pend = rows.filter((r) => r.status === "PENDING" && r.action !== "NEEDS_RAGHAV");
  const orderPend = pend.filter((r) => r.action === "ORDER_NOW").length;
  const pausePend = pend.filter((r) => r.action === "PAUSE_ORDER").length;
  const orders = rows.filter((r) => r.action === "ORDER_NOW" && r.status !== "REJECTED");
  const units = orders.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const e = ks.evaluation;

  return (
    <section className="kpis" aria-label="Summary">
      <div className="card kpi">
        <div className="kpi-label"><Inbox size={16} /> To review</div>
        <div className="kpi-value"><CountUp value={pendingCount} /><small>{pendingCount === 1 ? "flag" : "flags"}</small></div>
        <div className="kpi-foot">{pendingCount === 0 ? "Everything is answered" : `${orderPend} to order · ${pausePend} to pause`}</div>
      </div>

      <div className="card kpi">
        <div className="kpi-label"><Boxes size={16} /> Proposed order quantity</div>
        <div className="kpi-value"><CountUp value={units} /><small>units</small></div>
        <div className="kpi-foot">{orders.length} SKU{orders.length === 1 ? "" : "s"}, rejected ones not counted</div>
      </div>

      <div className="card kpi">
        <div className="kpi-label"><Gauge size={16} /> Rejection rate · 4 weeks</div>
        <div className="kpi-value">{e.rate === null ? "n/a" : <CountUp value={e.rate * 100} decimals={1} suffix="%" />}</div>
        <RateMeter rate={e.rate} />
        <div className="kpi-foot">
          {ks.stopped ? "Stopped" : e.collecting ? `Collecting data: ${e.decided} of ${config.killSwitch.minDecisions} decisions` : `${e.rejected} of ${e.decided} decisions rejected`}
        </div>
      </div>

      <div className="card kpi">
        <div className="kpi-label"><FileCheck2 size={16} /> Draft POs in Zoho</div>
        <div className="kpi-value"><CountUp value={created.length} /></div>
        <div className="kpi-foot">{created[0] ? `Latest ${created[0].zohoPoNumber}, ${created[0].zohoStatus}` : dryRun ? "Dry run mode: none will be created" : "None created yet"}</div>
      </div>
    </section>
  );
}
