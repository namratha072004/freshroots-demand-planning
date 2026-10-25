import type { FlagRow } from "@/lib/dashboard";
import { FlagRowCompact } from "./FlagRowCompact";

/** A column header and the rows under it. Rows are one line each; click one to expand it. */
export function FlagTable({ rows, festivalPct, mode = "decide", showRun = false, decisionLabel = "Decision" }: { rows: FlagRow[]; festivalPct: number; mode?: "decide" | "decided"; showRun?: boolean; decisionLabel?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="card ftable" role="list">
      <div className="ftable-head" aria-hidden>
        <span />
        <span>Product</span>
        <span>Action</span>
        <span>Stock cover</span>
        <span>Weekly sales</span>
        <span>{decisionLabel}</span>
      </div>
      {rows.map((r) => (
        <FlagRowCompact key={r.id} r={r} festivalPct={festivalPct} mode={mode} showRun={showRun} />
      ))}
    </div>
  );
}
