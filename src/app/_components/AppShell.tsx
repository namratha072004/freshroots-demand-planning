import Link from "next/link";
import { AlertTriangle, ArrowLeft, Boxes, Check, CircleDashed, Compass, FileCheck2, LayoutDashboard, ListChecks, LogOut, OctagonX, ScrollText, SlidersHorizontal, Sprout } from "lucide-react";
import { logout } from "../actions";
import type { ShellData, PipelineStep } from "@/lib/shell";
import { AppearanceMenu } from "./Appearance";
import { PoGlimpse } from "./PoGlimpse";

const NAV = [
  { id: "overview", href: "/", label: "Overview", icon: LayoutDashboard },
  { id: "review", href: "/review", label: "To review", icon: ListChecks },
  { id: "orders", href: "/orders", label: "Proposed orders", icon: Boxes },
  { id: "rejections", href: "/rejections", label: "Rejections", icon: OctagonX },
  { id: "pos", href: "/purchase-orders", label: "Purchase orders", icon: FileCheck2 },
  { id: "launches", href: "/launches", label: "New launches", icon: Compass },
  { id: "logs", href: "/logs", label: "Activity log", icon: ScrollText },
  { id: "settings", href: "/settings", label: "Settings", icon: SlidersHorizontal },
] as const;

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
  back,
  shell,
  children,
}: {
  active: "overview" | "review" | "orders" | "rejections" | "pos" | "launches" | "logs" | "settings";
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Shown above the title on a drill-down page. */
  back?: { href: string; label: string };
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
          {NAV.map((n) => (
            <Link key={n.id} href={n.href} className={`nav-link ${active === n.id ? "active" : ""}`} aria-current={active === n.id ? "page" : undefined}>
              <n.icon size={19} />
              <span className="label">{n.label}</span>
              {n.id === "review" && shell.flagsToReview > 0 && <span className="nav-count">{shell.flagsToReview}</span>}
              {n.id === "launches" && shell.leadsToReview > 0 && <span className="nav-count">{shell.leadsToReview}</span>}
            </Link>
          ))}
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
            {back && (
              <Link href={back.href} className="back-link">
                <ArrowLeft size={15} /> {back.label}
              </Link>
            )}
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
