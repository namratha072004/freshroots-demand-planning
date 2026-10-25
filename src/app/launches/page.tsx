import { logout } from "../actions";
import { Tabs } from "../_components/Tabs";
import { LeadButtons } from "../_components/LeadButtons";
import { getLaunchesData, type LeadRow } from "@/lib/leads";

export const dynamic = "force-dynamic";

function Lead({ l }: { l: LeadRow }) {
  return (
    <div className="row lead">
      <div>
        <div className="sku">{l.title}</div>
        <span className="badge">{l.category}</span>
        {l.mark === "interested" && <span className="badge ok">Interested</span>}
        {l.mark === "ignore" && <span className="badge bad">Ignored</span>}
      </div>
      <div>
        <div>{l.summary}</div>
        <div className="numbers">
          Source:{" "}
          <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer">
            {l.sourceSite || new URL(l.sourceUrl).hostname}
          </a>{" "}
          · published {l.sourceDate}
        </div>
      </div>
      <div />
      <LeadButtons id={l.id} mark={l.mark} />
    </div>
  );
}

export default async function LaunchesPage() {
  const { leads, lastRun } = await getLaunchesData();
  const todo = leads.filter((l) => l.mark === null);
  const decided = leads.filter((l) => l.mark !== null);
  const status = lastRun?.launchStatus;
  return (
    <div className="wrap">
      <header className="top">
        <h1>Freshroots Demand Planning</h1>
        <form action={logout}>
          <button>Sign out</button>
        </form>
      </header>
      <Tabs active="launches" />

      <div className="notice" style={{ background: "var(--info-bg)", color: "var(--info-text)" }}>
        Leads are unverified references found by web searches by product category. They are not demand
        estimates and not a suggestion to stock anything. The date is the source page&apos;s own publication date.
      </div>
      {(status === "failed" || status === "skipped" || status === "partial") && (
        <div className="notice">
          {status === "partial" ? "Some category searches failed in the last run." : "The launch search did not run in the last run."} The
          flags are unaffected.
        </div>
      )}
      {lastRun?.stats && (
        <p className="meta">
          Last run #{lastRun.id}: {lastRun.stats.searches} searches, {lastRun.stats.candidates} candidates, {lastRun.stats.kept} kept (the rest had no
          grounded source or no readable recent date).
        </p>
      )}

      <div className="card">
        {todo.length === 0 ? <div className="empty">{leads.length ? "No new leads to review." : "No leads yet. Leads appear after a run."}</div> : todo.map((l) => <Lead key={l.id} l={l} />)}
      </div>
      {decided.length > 0 && (
        <>
          <h2 style={{ fontSize: 15 }}>Marked</h2>
          <div className="card">{decided.map((l) => <Lead key={l.id} l={l} />)}</div>
        </>
      )}
    </div>
  );
}
