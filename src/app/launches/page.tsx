import { Bookmark, Compass, EyeOff, Info } from "lucide-react";
import { AppShell } from "../_components/AppShell";
import { LeadButtons } from "../_components/LeadButtons";
import { getLaunchesData, type LeadRow } from "@/lib/leads";
import { getShellData } from "@/lib/shell";

export const dynamic = "force-dynamic";

function host(l: LeadRow) {
  try {
    return l.sourceSite || new URL(l.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function Lead({ l }: { l: LeadRow }) {
  const h = host(l);
  return (
    <article className={`card lead ${l.mark ? "decided" : ""}`}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="chip plain">{l.category}</span>
        {l.mark === "interested" && <span className="chip ok"><Bookmark size={13} /> Interested</span>}
        {l.mark === "ignore" && <span className="chip bad"><EyeOff size={13} /> Ignored</span>}
      </div>
      <div className="lead-title">{l.title}</div>
      <p className="lead-summary">{l.summary}</p>
      <div className="lead-source">
        <span className="favicon" aria-hidden>{h.charAt(0)}</span>
        <span>
          <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer">{h}</a> · published {l.sourceDate}
        </span>
      </div>
      <div className="lead-foot">
        <span className="muted" style={{ fontSize: 12.5 }}>Unverified reference</span>
        <LeadButtons id={l.id} mark={l.mark} />
      </div>
    </article>
  );
}

export default async function LaunchesPage() {
  const [{ leads, lastRun }, shell] = await Promise.all([getLaunchesData(), getShellData()]);
  const todo = leads.filter((l) => l.mark === null);
  const decided = leads.filter((l) => l.mark !== null);
  const status = lastRun?.launchStatus;
  return (
    <AppShell
      active="launches"
      title="New launches"
      shell={shell}
      subtitle={lastRun?.stats ? <span>Last run #{lastRun.id}: {lastRun.stats.searches} searches, {lastRun.stats.candidates} candidates, {lastRun.stats.kept} kept</span> : "Sourced leads appear after a run."}
    >
      <div className="banner info">
        <Info size={20} style={{ flex: "none", marginTop: 1 }} />
        <div className="banner-body">
          Leads are unverified references found by web searches by product category. They are not demand estimates and not a suggestion to stock anything. The date shown is the source page&apos;s own publication date.
        </div>
      </div>
      {(status === "failed" || status === "skipped" || status === "partial") && (
        <div className="banner alert">
          <div className="banner-body">
            {status === "partial" ? "Some category searches failed in the last run." : "The launch search did not run in the last run."} The flags are unaffected.
          </div>
        </div>
      )}

      <section className="section" style={{ marginTop: 6 }} aria-label="To review">
        <div className="section-head">
          <Compass size={18} />
          <h2>To review</h2>
          <span className="count">{todo.length}</span>
        </div>
        {todo.length === 0 ? (
          <div className="card empty">
            <Compass size={30} />
            <div>{leads.length ? "No new leads to review." : "No leads yet. Leads appear after a run."}</div>
          </div>
        ) : (
          <div className="leads">{todo.map((l) => <Lead key={l.id} l={l} />)}</div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="section" aria-label="Marked">
          <div className="section-head">
            <Bookmark size={18} />
            <h2>Marked</h2>
            <span className="count">{decided.length}</span>
          </div>
          <div className="leads">{decided.map((l) => <Lead key={l.id} l={l} />)}</div>
        </section>
      )}
    </AppShell>
  );
}
