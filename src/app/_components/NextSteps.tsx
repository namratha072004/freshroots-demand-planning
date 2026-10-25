import { ArrowRight, CheckCheck, Compass, FileCheck2, ListChecks, RefreshCw } from "lucide-react";
import Link from "next/link";
import { getPendingAttempt, getReadyBatch } from "@/lib/zoho/draftPo";

/** The few things that need you, each with one button. Replaces a wall of lists on the overview. */
export async function NextSteps({ pendingCount, leadsToReview, stopped }: { pendingCount: number; leadsToReview: number; stopped: boolean }) {
  const [batch, attempt] = await Promise.all([getReadyBatch(), getPendingAttempt()]);
  const items: { icon: React.ReactNode; text: React.ReactNode; href: string; cta: string }[] = [];

  if (pendingCount > 0) items.push({ icon: <ListChecks size={19} />, text: <><strong>{pendingCount} {pendingCount === 1 ? "flag is" : "flags are"} waiting</strong> for your approve or reject.</>, href: "/review", cta: "Review flags" });
  if (attempt) items.push({ icon: <RefreshCw size={19} />, text: <><strong>A draft PO did not finish.</strong> It is not known whether Zoho created it. Check it safely.</>, href: "/purchase-orders", cta: "Check it" });
  else if (batch && !stopped) items.push({ icon: <FileCheck2 size={19} />, text: <><strong>{batch.lines.length} approved {batch.lines.length === 1 ? "line is" : "lines are"} ready</strong> for a draft PO ({batch.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}).</>, href: "/purchase-orders", cta: "Create draft PO" });
  if (leadsToReview > 0) items.push({ icon: <Compass size={19} />, text: <><strong>{leadsToReview} new launch {leadsToReview === 1 ? "lead" : "leads"}</strong> to mark interested or ignore.</>, href: "/launches", cta: "See leads" });

  return (
    <section className="card nextsteps" aria-label="What to do next">
      <h2 className="settings-title" style={{ fontSize: 16 }}>What to do next</h2>
      {items.length === 0 ? (
        <div className="next-row calm"><CheckCheck size={19} /> <span>You are all caught up. Nothing needs a decision right now.</span></div>
      ) : (
        items.map((i, n) => (
          <div key={n} className="next-row">
            <span className="next-icon">{i.icon}</span>
            <span className="next-text">{i.text}</span>
            <Link href={i.href} className="btn primary next-cta">{i.cta} <ArrowRight size={15} /></Link>
          </div>
        ))
      )}
    </section>
  );
}
