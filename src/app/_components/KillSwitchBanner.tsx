import { BellRing, OctagonAlert } from "lucide-react";
import type { KillSwitchStatus } from "@/lib/killSwitch";
import { ResumeForm } from "./ResumeForm";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Shown only when something needs attention. No owner or notification channel is defined (Check 09). */
export function KillSwitchBanner({ status, limits }: { status: KillSwitchStatus; limits: { alertRate: number; stopRate: number; windowWeeks: number; minDecisions: number } }) {
  const { evaluation: e, stopped } = status;
  const ks = limits;
  const windowText = `last ${ks.windowWeeks} weeks`;

  if (stopped) {
    const s = status.stopSummary;
    return (
      <div className="banner stop" role="alert">
        <OctagonAlert size={22} style={{ flex: "none", marginTop: 1 }} />
        <div className="banner-body">
          <strong>Kill switch stopped.</strong> The rejection rate reached {pct(s?.rate ?? null)} ({s?.rejected} rejected of {s?.decided} decided, {windowText}); the stop level is{" "}
          {pct(ks.stopRate)}. Scheduled and manual runs and &ldquo;Create draft PO&rdquo; are blocked until someone resumes with a note.
          <ResumeForm />
        </div>
      </div>
    );
  }
  if (e.alert) {
    return (
      <div className="banner alert" role="alert">
        <BellRing size={22} style={{ flex: "none", marginTop: 1 }} />
        <div className="banner-body">
          <strong>Alert:</strong> {e.rejected} of {e.decided} decisions were rejected in the {windowText} ({pct(e.rate)}); the alert level is {pct(ks.alertRate)}.
          {e.collecting && ` Still collecting data (${e.decided} of ${ks.minDecisions}), so it cannot stop yet.`}
        </div>
      </div>
    );
  }
  if (status.lastResume) {
    return (
      <div className="banner info">
        <div className="banner-body">
          Resumed {new Date(status.lastResume.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST: &ldquo;{status.lastResume.note}&rdquo;
        </div>
      </div>
    );
  }
  return null;
}
