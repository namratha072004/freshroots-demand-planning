import { config } from "@/config";
import type { KillSwitchStatus } from "@/lib/killSwitch";
import { ResumeForm } from "./ResumeForm";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Shows the kill-switch state. No owner and no notification channel: that is not settled (Check 09). */
export function KillSwitchBanner({ status }: { status: KillSwitchStatus }) {
  const { evaluation: e, stopped } = status;
  const ks = config.killSwitch;
  const counts = `${e.rejected} rejected of ${e.decided} decided`;
  const windowText = `last ${ks.windowWeeks} weeks`;

  if (stopped) {
    const s = status.stopSummary;
    return (
      <div className="card banner stop" role="alert">
        <strong>Kill switch STOPPED.</strong> Rejection rate reached {pct(s?.rate ?? null)} ({s?.rejected} rejected of{" "}
        {s?.decided} decided, {windowText}); the stop level is {pct(ks.stopRate)}. Scheduled and manual runs are blocked
        and &ldquo;Create draft PO&rdquo; is blocked until someone resumes with a note.
        <ResumeForm />
      </div>
    );
  }

  return (
    <div className={`card banner ${e.alert ? "alert" : ""}`}>
      {e.alert && (
        <div role="alert">
          <strong>Alert:</strong> rejection rate is {pct(e.rate)} ({counts}, {windowText}); alert level is{" "}
          {pct(ks.alertRate)}.
        </div>
      )}
      <div className="meta">
        Kill switch: rejection rate {pct(e.rate)} ({counts}, {windowText}).{" "}
        {e.collecting
          ? `Collecting data: ${e.decided} of ${ks.minDecisions} decisions needed before a stop can happen.`
          : `Stops at ${pct(ks.stopRate)}.`}
        {status.lastResume && ` Resumed ${new Date(status.lastResume.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST: “${status.lastResume.note}”.`}
      </div>
    </div>
  );
}
