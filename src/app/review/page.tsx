import { CheckCheck, Hand, PauseCircle, ShoppingCart } from "lucide-react";
import { AppShell } from "../_components/AppShell";
import { FlagTable } from "../_components/FlagTable";
import { RunControls } from "../_components/RunControls";
import { loadBoard } from "@/lib/board";
import { pickRows } from "@/lib/views";

export const dynamic = "force-dynamic";

function Group({ icon, title, note, count, children }: { icon: React.ReactNode; title: string; note: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        {icon}
        <h2>{title}</h2>
        <span className="count">{count}</span>
        <span className="section-note">{note}</span>
      </div>
      {children}
    </section>
  );
}

/** To review: only the flags waiting for a decision, one line each. */
export default async function ReviewPage() {
  const { ks, shell, festivalPct, run, rows, decided, pendingCount } = await loadBoard();
  const pending = pickRows("pending", rows, decided);
  const orders = pending.filter((r) => r.action === "ORDER_NOW");
  const pauses = pending.filter((r) => r.action === "PAUSE_ORDER");
  const judgment = rows.filter((r) => r.action === "NEEDS_RAGHAV" && r.status === "PENDING");
  const doneThisRun = rows.filter((r) => r.status !== "PENDING");

  return (
    <AppShell
      active="review"
      title={`To review · ${pendingCount} ${pendingCount === 1 ? "flag" : "flags"}`}
      back={{ href: "/", label: "Overview" }}
      shell={shell}
      subtitle={run ? `Run #${run.id}. Approve or reject each flag. Click a row for its charts and the AI reason.` : "No run yet."}
      actions={<RunControls pendingCount={pendingCount} stopped={ks.stopped} />}
    >
      {pending.length === 0 && judgment.length === 0 && doneThisRun.length === 0 ? (
        <div className="card empty">
          <CheckCheck size={30} />
          <div>Everything is answered. Nothing is waiting for review.</div>
        </div>
      ) : (
        <>
          <Group icon={<ShoppingCart size={18} />} title="Order now" note="Approve to add to the draft PO" count={orders.length}>
            <FlagTable rows={orders} festivalPct={festivalPct} />
          </Group>
          <Group icon={<PauseCircle size={18} />} title="Pause the next order" note="Approving records the decision; no PO is created" count={pauses.length}>
            <FlagTable rows={pauses} festivalPct={festivalPct} />
          </Group>
          <Group icon={<Hand size={18} />} title="Needs your judgment" note="Outside the rules, so not counted above" count={judgment.length}>
            <FlagTable rows={judgment} festivalPct={festivalPct} />
          </Group>
          {pending.length === 0 && judgment.length === 0 && (
            <div className="card empty">
              <CheckCheck size={30} />
              <div>Everything is answered. Nothing is waiting for review.</div>
            </div>
          )}
          <Group icon={<CheckCheck size={18} />} title="Decided in this run" note="Approved or rejected" count={doneThisRun.length}>
            <FlagTable rows={doneThisRun} festivalPct={festivalPct} mode="decided" decisionLabel="Decision" />
          </Group>
        </>
      )}
    </AppShell>
  );
}
