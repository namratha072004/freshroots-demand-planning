import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { describeDelta } from "@/lib/quantity";

/** The difference between what the rules suggested and what the planner chose, e.g. "−450 (−60%)". */
export function DeltaChip({ suggested, chosen }: { suggested: number; chosen: number }) {
  const d = describeDelta(suggested, chosen);
  if (d.units === 0) return <span className="chip plain">Same as suggested</span>;
  const down = d.units < 0;
  const text = `${down ? "−" : "+"}${Math.abs(d.units).toLocaleString("en-IN")} (${down ? "−" : "+"}${Math.abs(d.percent)}%)`;
  return (
    <span className={`chip ${down ? "pause" : "warn"}`} title={down ? "Ordering less than suggested" : "Ordering more than suggested"}>
      {down ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />} {text}
    </span>
  );
}
