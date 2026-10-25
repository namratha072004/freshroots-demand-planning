import { cookies } from "next/headers";
import { ExternalLink, History, KeyRound, LogOut, Palette, ReceiptText } from "lucide-react";
import { logout } from "../actions";
import { AppShell } from "../_components/AppShell";
import { AppearancePicker } from "../_components/Appearance";
import { PoModeToggle } from "../_components/PoModeToggle";
import { SettingsForm, type GroupSpec } from "../_components/SettingsForm";
import { GROUP_META, SETTING_DEFS, listAudit, loadSettingsView, type SettingGroup } from "@/lib/settings";
import { getAuthMode } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

const round = (n: number) => Math.round(n * 1000) / 1000;

function groupSpecs(groups: SettingGroup[], view: Awaited<ReturnType<typeof loadSettingsView>>): GroupSpec[] {
  const get = (o: unknown, path: string[]) => path.reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o) as number;
  return groups.map((g) => ({
    id: g,
    title: GROUP_META[g].title,
    blurb: GROUP_META[g].blurb,
    fields: SETTING_DEFS.filter((d) => d.group === g).map((d) => {
      const k = d.percent ? 100 : 1;
      return {
        key: d.key,
        label: d.label,
        help: d.help,
        unit: d.unit,
        value: round(get(view.effective, d.path) * k),
        def: round(get(view.defaults, d.path) * k),
        min: round(d.min * k),
        max: round(d.max * k),
        step: d.step,
        edited: view.edited.has(d.key),
      };
    }),
  }));
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default async function SettingsPage() {
  const [shell, view, audit] = await Promise.all([getShellData(), loadSettingsView(), listAudit(12)]);
  const mode = getAuthMode();
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const colourMode = parseMode(jar.get(MODE_COOKIE)?.value);

  return (
    <AppShell
      active="settings"
      title="Settings"
      shell={shell}
      subtitle="Edit the rules and limits. Changes apply to the next run; flags already on the list keep the numbers they were calculated with."
    >
      <div className="settings-grid">
        <section className="card settings-card" aria-label="Appearance">
          <h2 className="settings-title"><Palette size={18} /> Appearance</h2>
          <p className="muted settings-intro">Pick a colour theme and light or dark. It applies instantly and is remembered on this device. Status colours (order, pause, approved, rejected) stay the same in every theme so they always mean the same thing.</p>
          <AppearancePicker initialTheme={theme} initialMode={colourMode} />
        </section>

        <SettingsForm
          title="Raghav's rules (the rubric)"
          intro="These five rules decide every flag. Every number is applied by code, never by the AI. Each edit is recorded in the change history below."
          groups={groupSpecs(["rule1", "rule2", "rule3", "rule4", "rule5", "data"], view)}
        />

        <SettingsForm
          title="Kill switch"
          groups={groupSpecs(["killSwitch"], view)}
          warning="This is the safety net. A lower stop level or a higher minimum makes it harder to trigger."
        />

        <SettingsForm title="New launches" groups={groupSpecs(["launches"], view)} />

        <section className="card settings-card" aria-label="Purchase orders">
          <h2 className="settings-title"><ReceiptText size={18} /> Purchase orders</h2>
          <p className="muted settings-intro">Choose what the Create draft PO button does. Procurement still adds the price and places the order inside Zoho.</p>
          <PoModeToggle dryRun={shell.dryRun} />
          <div className="rule-head" style={{ marginTop: 18 }}>
            <strong>Latest draft POs</strong>
          </div>
          {shell.pos.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>None yet.</p>
          ) : (
            shell.pos.map((p) => (
              <div key={p.number} className="glimpse-row">
                <div>
                  <strong>{p.number}</strong> <span className="chip ok" style={{ marginLeft: 6 }}>{p.status}</span>
                  <div className="muted" style={{ fontSize: 13 }}>{p.lines} · {when(p.createdAt)} IST</div>
                </div>
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.number} in Zoho`}><ExternalLink size={16} /></a>}
              </div>
            ))
          )}
          {shell.zohoListUrl && (
            <a className="glimpse-all" href={shell.zohoListUrl} target="_blank" rel="noopener noreferrer">All purchase orders in Zoho <ExternalLink size={13} /></a>
          )}
        </section>

        <section className="card settings-card" aria-label="Access">
          <h2 className="settings-title"><KeyRound size={18} /> Access</h2>
          <p className="muted settings-intro">
            Login mode is <strong>{mode === "open" ? "open (any password works)" : "password"}</strong>. To require a password, set <code>AUTH_MODE=password</code> and{" "}
            <code>DASHBOARD_PASSWORD</code> in the Vercel project settings and redeploy. It is not editable here on purpose: in open mode anyone could otherwise lock you out.
          </p>
          <form action={logout}>
            <button className="primary"><LogOut size={16} /> Go to the login page</button>
          </form>
        </section>

        <section className="card settings-card" aria-label="Change history">
          <h2 className="settings-title"><History size={18} /> Change history</h2>
          {audit.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No settings have been changed yet. Everything is at the defaults.</p>
          ) : (
            audit.map((a, i) => (
              <div key={i} className="glimpse-row">
                <div>
                  <strong>{a.label}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>{a.oldValue} → {a.newValue}</div>
                </div>
                <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{when(a.changedAt)} IST</span>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
