import { ArrowUpRight, Boxes, FileCheck2, Gauge, Inbox } from "lucide-react";
import Link from "next/link";
import type { FlagRow } from "@/lib/dashboard";
import type { KillSwitchStatus } from "@/lib/killSwitch";
import { orderTotals, type View } from "@/lib/views";
import { listDraftPos } from "@/lib/zoho/draftPo";
import { CountUp } from "./CountUp";
import { RateMeter } from "./RateMeter";

/** Four headline numbers. Each one opens the list behind it (the flag list is filtered with ?view=...). */
export async function KpiStrip({
  rows,
  pendingCount,
  ks,
  dryRun,
  limits,
  view,
}: {
  rows: FlagRow[];
  pendingCount: number;
  ks: KillSwitchStatus;
  dryRun: boolean;
  limits: { alertRate: number; stopRate: number; minDecisions: number; windowWeeks: number };
  view: View;
}) {
  const pos = await listDraftPos(5);
  const created = pos.filter((p) => p.status === "created");
  const pend = rows.filter((r) => r.status === "PENDING" && r.action !== "NEEDS_RAGHAV");
  const orderPend = pend.filter((r) => r.action === "ORDER_NOW").length;
  const pausePend = pend.filter((r) => r.action === "PAUSE_ORDER").length;
  const { units, skus } = orderTotals(rows);
  const e = ks.evaluation;

  return (
    <section className="kpis" aria-label="Summary. Each card opens the list behind it.">
      <Link href="/?view=pending#flags" className={`card kpi kpi-link ${view === "pending" ? "active" : ""}`} aria-current={view === "pending" ? "true" : undefined}>
        <div className="kpi-label"><Inbox size={16} /> To review <ArrowUpRight size={14} className="kpi-go" /></div>
        <div className="kpi-value"><CountUp value={pendingCount} /><small>{pendingCount === 1 ? "flag" : "flags"}</small></div>
        <div className="kpi-foot">{pendingCount === 0 ? "Everything is answered" : `${orderPend} to order · ${pausePend} to pause`}</div>
      </Link>

      <Link href="/?view=orders#flags" className={`card kpi kpi-link ${view === "orders" ? "active" : ""}`} aria-current={view === "orders" ? "true" : undefined}>
        <div className="kpi-label"><Boxes size={16} /> Proposed order quantity <ArrowUpRight size={14} className="kpi-go" /></div>
        <div className="kpi-value"><CountUp value={units} /><small>units</small></div>
        <div className="kpi-foot">{skus} SKU{skus === 1 ? "" : "s"}, rejected ones not counted</div>
      </Link>

      <Link href="/?view=rejected#flags" className={`card kpi kpi-link ${view === "rejected" ? "active" : ""}`} aria-current={view === "rejected" ? "true" : undefined}>
        <div className="kpi-label"><Gauge size={16} /> Rejection rate · {limits.windowWeeks} {limits.windowWeeks === 1 ? "week" : "weeks"} <ArrowUpRight size={14} className="kpi-go" /></div>
        <div className="kpi-value">{e.rate === null ? "n/a" : <CountUp value={e.rate * 100} decimals={1} suffix="%" />}</div>
        <RateMeter rate={e.rate} alertRate={limits.alertRate} stopRate={limits.stopRate} />
        <div className="kpi-foot">
          {ks.stopped ? "Stopped" : e.collecting ? `Collecting data: ${e.decided} of ${limits.minDecisions} decisions` : `${e.rejected} of ${e.decided} decisions rejected`}
        </div>
      </Link>

      <Link href="/#draft-po" className="card kpi kpi-link">
        <div className="kpi-label"><FileCheck2 size={16} /> Draft POs in Zoho <ArrowUpRight size={14} className="kpi-go" /></div>
        <div className="kpi-value"><CountUp value={created.length} /></div>
        <div className="kpi-foot">{created[0] ? `Latest ${created[0].zohoPoNumber}, ${created[0].zohoStatus}` : dryRun ? "Dry run mode: none will be created" : "None created yet"}</div>
      </Link>
    </section>
  );
}
