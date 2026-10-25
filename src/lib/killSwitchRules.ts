import { config } from "@/config";

export interface DecisionRecord {
  status: string; // APPROVED | REJECTED | PENDING | SUPERSEDED
  action: string; // ORDER_NOW | PAUSE_ORDER | NEEDS_RAGHAV
  decidedAt: Date | null;
}

export interface KillSwitchEvaluation {
  approved: number;
  rejected: number;
  decided: number;
  /** rejected / decided, or null when nothing is decided yet. */
  rate: number | null;
  /** Fewer than MIN_DECISIONS decided in the window: the stop never fires, but rate and alert still show. */
  collecting: boolean;
  /** Rate at or above the alert level (shown even while collecting). */
  alert: boolean;
  /** Rate at or above the stop level AND enough decisions. */
  wouldStop: boolean;
  /** Decisions before this moment are ignored. */
  windowStart: Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rejection rate = rejected / (approved + rejected) over a rolling window ending at `now` (the real clock,
 * never ASOF_OVERRIDE). Only decisions made after the latest resume count. NEEDS_RAGHAV, SUPERSEDED and
 * undecided items never count. Pure.
 */
export function evaluateKillSwitch(decisions: DecisionRecord[], now: Date, lastResumedAt: Date | null): KillSwitchEvaluation {
  const { alertRate, stopRate, windowWeeks, minDecisions } = config.killSwitch;
  const rolling = now.getTime() - windowWeeks * WEEK_MS;
  const windowStart = new Date(Math.max(rolling, lastResumedAt?.getTime() ?? -Infinity));

  let approved = 0;
  let rejected = 0;
  for (const d of decisions) {
    if (d.action === "NEEDS_RAGHAV" || d.decidedAt === null) continue;
    if (d.decidedAt < windowStart || d.decidedAt > now) continue;
    if (d.status === "APPROVED") approved++;
    else if (d.status === "REJECTED") rejected++;
  }
  const decided = approved + rejected;
  const rate = decided === 0 ? null : rejected / decided;
  const eps = 1e-9;
  const collecting = decided < minDecisions;
  return {
    approved,
    rejected,
    decided,
    rate,
    collecting,
    alert: rate !== null && rate >= alertRate - eps,
    wouldStop: !collecting && rate !== null && rate >= stopRate - eps,
    windowStart,
  };
}
