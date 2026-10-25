import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, Compass, ListChecks, LogOut, SlidersHorizontal, Sprout } from "lucide-react";
import { logout } from "../actions";
import type { ShellData, PipelineStep } from "@/lib/shell";
import { AppearanceMenu } from "./Appearance";
import { PoGlimpse } from "./PoGlimpse";

function StepDot({ state }: { state: PipelineStep["state"] }) {
  if (state === "done") return <span className="pipe-dot done"><Check size={13} strokeWidth={3} /></span>;
  if (state === "warn") return <span className="pipe-dot warn"><AlertTriangle size={12} strokeWidth={2.6} /></span>;
  return <span className="pipe-dot"><CircleDashed size={13} /></span>;
}

/** Dark sidebar (brand, navigation, the last run as a pipeline, current modes) plus the page header. */
export function AppShell({
  active,
  title,
  subtitle,
  actions,
  shell,
  children,
}: {
  active: "flags" | "launches" | "settings";
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  shell: ShellData;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><Sprout size={22} strokeWidth={2.3} /></span>
          <div>
            <div className="brand-name">Freshroots</div>
            <div className="brand-sub">Demand planning</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          <Link href="/" className={`nav-link ${active === "flags" ? "active" : ""}`} aria-current={active === "flags" ? "page" : undefined}>
            <ListChecks size={19} />
            <span className="label">Flag list</span>
            {shell.flagsToReview > 0 && <span className="nav-count">{shell.flagsToReview}</span>}
          </Link>
          <Link href="/launches" className={`nav-link ${active === "launches" ? "active" : ""}`} aria-current={active === "launches" ? "page" : undefined}>
            <Compass size={19} />
            <span className="label">New launches</span>
            {shell.leadsToReview > 0 && <span className="nav-count">{shell.leadsToReview}</span>}
          </Link>
          <Link href="/settings" className={`nav-link ${active === "settings" ? "active" : ""}`} aria-current={active === "settings" ? "page" : undefined}>
            <SlidersHorizontal size={19} />
            <span className="label">Settings</span>
          </Link>
        </nav>

        <div className="pipe-block">
          <div className="side-label">Last run{shell.runLabel ? ` · ${shell.runLabel}` : ""}</div>
          {shell.steps.length > 0 ? (
            <ol className="pipe">
              {shell.steps.map((s) => (
                <li key={s.label}>
                  <StepDot state={s.state} />
                  <div>
                    <div className="pipe-title">{s.label}</div>
                    <div className="pipe-detail">{s.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="pipe-detail" style={{ padding: "8px 8px 0" }}>No run yet. Press Run now.</div>
          )}
        </div>

        <div className="side-foot">
          <div className="mode-chips">
            <span className="mode-chip">{shell.authMode === "open" ? "Open login" : "Password login"}</span>
            <span className="mode-chip">{shell.dryRun ? "PO dry run" : "PO live"}</span>
          </div>
          <form action={logout}>
            <button className="side-signout"><LogOut size={16} /> Sign out</button>
          </form>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <div className="page-sub">{subtitle}</div>}
          </div>
          <div className="head-actions">
            <AppearanceMenu />
            <PoGlimpse pos={shell.pos} listUrl={shell.zohoListUrl} />
            {actions}
            <form action={logout}>
              <button className="ghost" title="Sign out and return to the login page"><LogOut size={16} /> Sign out</button>
            </form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
