import { config } from "@/config";
import { getSql } from "./db";
import { isDryRun } from "./zoho/client";

/** The values the app actually runs with: the defaults in src/config.ts overlaid with anything edited on the Settings page. */
export interface Settings {
  rules: {
    avgWindowWeeks: number;
    recentWindowWeeks: number;
    highDemandThreshold: number;
    highDemandQtyMultiplier: number;
    festivalUplift: number;
    cover: { min: number; max: number };
    coverPerishable: { min: number; max: number };
    minHistoryWeeks: number;
    epsilon: number;
    roundQtyUp: boolean;
  };
  data: { staleDays: number };
  killSwitch: { alertRate: number; stopRate: number; windowWeeks: number; minDecisions: number };
  launches: { maxSearchesPerRun: number; maxAgeDays: number };
  /** true = the Create draft PO button only shows the request. */
  zohoDryRun: boolean;
}

export type SettingGroup = "rule1" | "rule2" | "rule3" | "rule4" | "rule5" | "data" | "killSwitch" | "launches";

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  unit: string;
  /** Stored as a fraction, shown as a percentage (0.2 is shown as 20). */
  percent?: boolean;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  path: string[];
}

export const GROUP_META: Record<SettingGroup, { title: string; blurb: string }> = {
  rule1: { title: "Rule 1 · High demand", blurb: "Flag a SKU when its last 4 weeks of sales are more than this far above its 12-week average, and recommend a bigger reorder." },
  rule2: { title: "Rule 2 · Stockout risk", blurb: "Flag a SKU when stock is below this many weeks of average sales. The action is ORDER_NOW." },
  rule3: { title: "Rule 3 · Overstock risk", blurb: "Flag a SKU when stock is above this many weeks of average sales. The action is PAUSE_ORDER." },
  rule4: { title: "Rule 4 · Festival months", blurb: "In festival months (October, November, March) demand is raised by this much before the stock checks." },
  rule5: { title: "Rule 5 · High-perishability SKUs", blurb: "Tighter windows for perishable SKUs. They replace the normal minimum and maximum above." },
  data: { title: "Data checks", blurb: "When the system refuses to guess and hands the SKU to you, or warns about old data." },
  killSwitch: { title: "Kill switch", blurb: "Watches how often you reject recommendations. Lowering the stop level or raising the minimum weakens this safety net, so every change is recorded." },
  launches: { title: "New launches", blurb: "Limits for the web search that finds new product launches." },
};

export const SETTING_DEFS: SettingDef[] = [
  { key: "rules.highDemandThreshold", group: "rule1", label: "Demand rise that counts as high demand", help: "Last-4-week average above the 12-week average by more than this.", unit: "%", percent: true, min: 0.01, max: 3, step: 1, path: ["rules", "highDemandThreshold"] },
  { key: "rules.highDemandQtyMultiplier", group: "rule1", label: "Reorder quantity multiplier", help: "Times the standard reorder quantity when demand is high.", unit: "×", min: 1, max: 5, step: 0.1, path: ["rules", "highDemandQtyMultiplier"] },
  { key: "rules.cover.min", group: "rule2", label: "Minimum weeks of cover", help: "Below this is a stockout risk (normal SKUs).", unit: "weeks", min: 0.5, max: 52, step: 0.5, path: ["rules", "cover", "min"] },
  { key: "rules.cover.max", group: "rule3", label: "Maximum weeks of cover", help: "Above this is an overstock risk (normal SKUs).", unit: "weeks", min: 1, max: 104, step: 0.5, path: ["rules", "cover", "max"] },
  { key: "rules.festivalUplift", group: "rule4", label: "Festival demand uplift", help: "Added to average weekly sales when checking weeks of cover.", unit: "%", percent: true, min: 0, max: 1, step: 1, path: ["rules", "festivalUplift"] },
  { key: "rules.coverPerishable.min", group: "rule5", label: "Minimum weeks of cover (perishable)", help: "Below this is a stockout risk for perishable SKUs.", unit: "weeks", min: 0.5, max: 52, step: 0.5, path: ["rules", "coverPerishable", "min"] },
  { key: "rules.coverPerishable.max", group: "rule5", label: "Maximum weeks of cover (perishable)", help: "Above this is an overstock risk for perishable SKUs.", unit: "weeks", min: 1, max: 104, step: 0.5, path: ["rules", "coverPerishable", "max"] },
  { key: "rules.minHistoryWeeks", group: "data", label: "Minimum weeks of sales history", help: "Fewer weeks than this and the SKU becomes NEEDS_RAGHAV.", unit: "weeks", min: 4, max: 52, step: 1, integer: true, path: ["rules", "minHistoryWeeks"] },
  { key: "data.staleDays", group: "data", label: "Stale data after", help: "Stock snapshot or latest sales week older than this is warned about.", unit: "days", min: 1, max: 60, step: 1, integer: true, path: ["data", "staleDays"] },
  { key: "killSwitch.alertRate", group: "killSwitch", label: "Alert when rejected", help: "Rejection rate at or above this shows the alert.", unit: "%", percent: true, min: 0.01, max: 1, step: 1, path: ["killSwitch", "alertRate"] },
  { key: "killSwitch.stopRate", group: "killSwitch", label: "Stop when rejected", help: "Rejection rate at or above this stops runs and draft POs.", unit: "%", percent: true, min: 0.01, max: 1, step: 1, path: ["killSwitch", "stopRate"] },
  { key: "killSwitch.windowWeeks", group: "killSwitch", label: "Measured over", help: "Rolling window for the rejection rate.", unit: "weeks", min: 1, max: 12, step: 1, integer: true, path: ["killSwitch", "windowWeeks"] },
  { key: "killSwitch.minDecisions", group: "killSwitch", label: "Decisions needed before it can stop", help: "Below this it only collects data and never stops.", unit: "decisions", min: 1, max: 200, step: 1, integer: true, path: ["killSwitch", "minDecisions"] },
  { key: "launches.maxSearchesPerRun", group: "launches", label: "Searches per run", help: "Most web searches one run may make, retries included.", unit: "searches", min: 1, max: 20, step: 1, integer: true, path: ["launches", "maxSearchesPerRun"] },
  { key: "launches.maxAgeDays", group: "launches", label: "Newest-news window", help: "Leads whose source page is older than this are dropped.", unit: "days", min: 7, max: 720, step: 1, integer: true, path: ["launches", "maxAgeDays"] },
];

export const PO_MODE_KEY = "po.dryRun";

function getPath(obj: unknown, path: string[]): number {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as number;
}
function setPath(obj: unknown, path: string[], value: number) {
  const parent = path.slice(0, -1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, number>;
  parent[path[path.length - 1]] = value;
}

/** Fresh copy of the defaults (src/config.ts, and ZOHO_DRY_RUN from the environment). */
export function defaultSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return {
    rules: {
      avgWindowWeeks: config.rules.avgWindowWeeks,
      recentWindowWeeks: config.rules.recentWindowWeeks,
      highDemandThreshold: config.rules.highDemandThreshold,
      highDemandQtyMultiplier: config.rules.highDemandQtyMultiplier,
      festivalUplift: config.rules.festivalUplift,
      cover: { ...config.rules.cover },
      coverPerishable: { ...config.rules.coverPerishable },
      minHistoryWeeks: config.rules.minHistoryWeeks,
      epsilon: config.rules.epsilon,
      roundQtyUp: config.rules.roundQtyUp,
    },
    data: { staleDays: config.data.staleDays },
    killSwitch: { ...config.killSwitch },
    launches: { maxSearchesPerRun: config.launches.maxSearchesPerRun, maxAgeDays: config.launches.maxAgeDays },
    zohoDryRun: isDryRun(env),
  };
}

export type Overrides = Record<string, number | boolean>;

/** Defaults overlaid with the saved overrides. Unknown keys and values outside the allowed range are ignored. Pure. */
export function applyOverrides(base: Settings, overrides: Overrides): Settings {
  const s: Settings = JSON.parse(JSON.stringify(base));
  for (const def of SETTING_DEFS) {
    const v = overrides[def.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= def.min && v <= def.max) setPath(s, def.path, v);
  }
  if (typeof overrides[PO_MODE_KEY] === "boolean") s.zohoDryRun = overrides[PO_MODE_KEY] as boolean;
  // A saved set that breaks the ordering rules is ignored as a whole rather than half-applied.
  return crossErrors(s).length ? base : s;
}

/** Rules that involve more than one value. */
export function crossErrors(s: Settings): string[] {
  const e: string[] = [];
  if (s.rules.cover.min >= s.rules.cover.max) e.push("The minimum weeks of cover must be lower than the maximum.");
  if (s.rules.coverPerishable.min >= s.rules.coverPerishable.max) e.push("The perishable minimum must be lower than the perishable maximum.");
  if (s.killSwitch.alertRate >= s.killSwitch.stopRate) e.push("The alert level must be lower than the stop level.");
  return e;
}

export interface SaveOutcome {
  ok: boolean;
  errors: string[];
  changed: number;
}

/** Validate a set of edited display values (percent fields as shown, e.g. 20) against the defs. Pure. */
export function validateEdits(edits: Record<string, number>, current: Settings): { next: Settings; errors: string[] } {
  const errors: string[] = [];
  const next: Settings = JSON.parse(JSON.stringify(current));
  for (const def of SETTING_DEFS) {
    if (!(def.key in edits)) continue;
    const shown = edits[def.key];
    if (!Number.isFinite(shown)) {
      errors.push(`${def.label}: enter a number.`);
      continue;
    }
    const v = def.percent ? shown / 100 : shown;
    const lo = def.percent ? def.min * 100 : def.min;
    const hi = def.percent ? def.max * 100 : def.max;
    if (v < def.min - 1e-9 || v > def.max + 1e-9) {
      errors.push(`${def.label}: use a value between ${lo} and ${hi} ${def.unit}.`);
      continue;
    }
    if (def.integer && !Number.isInteger(v)) {
      errors.push(`${def.label}: use a whole number.`);
      continue;
    }
    setPath(next, def.path, Math.round(v * 1e6) / 1e6);
  }
  if (errors.length === 0) errors.push(...crossErrors(next));
  return { next, errors };
}

// ---------- database ----------

async function loadOverrides(): Promise<Overrides> {
  const rows = await getSql()`SELECT key, value FROM app_settings`;
  const out: Overrides = {};
  for (const r of rows) out[r.key as string] = r.value as number | boolean;
  return out;
}

/** The settings the app runs with right now. If the table cannot be read, the defaults are used. */
export async function loadSettings(): Promise<Settings> {
  const base = defaultSettings();
  try {
    return applyOverrides(base, await loadOverrides());
  } catch {
    return base;
  }
}

/** Everything the Settings page needs: the effective values, the defaults, and which keys are edited. */
export async function loadSettingsView() {
  const defaults = defaultSettings();
  const overrides = await loadOverrides();
  return { effective: applyOverrides(defaults, overrides), defaults, edited: new Set(Object.keys(overrides)) };
}

/** Is the Create draft PO button in dry-run mode? The Settings page value wins over the ZOHO_DRY_RUN environment value. */
export async function getZohoDryRun(): Promise<boolean> {
  return (await loadSettings()).zohoDryRun;
}

async function write(key: string, oldVal: unknown, newVal: unknown, isDefault: boolean) {
  const sql = getSql();
  if (isDefault) await sql`DELETE FROM app_settings WHERE key = ${key}`;
  else await sql`INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(newVal)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  await sql`INSERT INTO settings_audit (key, old_value, new_value) VALUES (${key}, ${JSON.stringify(oldVal)}::jsonb, ${JSON.stringify(newVal)}::jsonb)`;
}

/** Save edited values (display units). Only values that actually changed are written; a value equal to its default removes the override. */
export async function saveEdits(edits: Record<string, number>): Promise<SaveOutcome> {
  const { effective, defaults } = await loadSettingsView();
  const { next, errors } = validateEdits(edits, effective);
  if (errors.length) return { ok: false, errors, changed: 0 };
  let changed = 0;
  for (const def of SETTING_DEFS) {
    if (!(def.key in edits)) continue;
    const before = getPath(effective, def.path);
    const after = getPath(next, def.path);
    if (Math.abs(before - after) < 1e-9) continue;
    await write(def.key, before, after, Math.abs(getPath(defaults, def.path) - after) < 1e-9);
    changed++;
  }
  return { ok: true, errors: [], changed };
}

/** Put the PO button into live (false) or dry-run (true) mode. */
export async function setPoDryRun(dry: boolean): Promise<void> {
  const { effective, defaults } = await loadSettingsView();
  if (effective.zohoDryRun === dry) return;
  await write(PO_MODE_KEY, effective.zohoDryRun, dry, defaults.zohoDryRun === dry);
}

/** Reset every value in a group (or everything) to the defaults. */
export async function resetGroup(group: SettingGroup | "all"): Promise<number> {
  const { effective, defaults, edited } = await loadSettingsView();
  let n = 0;
  for (const def of SETTING_DEFS) {
    if ((group !== "all" && def.group !== group) || !edited.has(def.key)) continue;
    await write(def.key, getPath(effective, def.path), getPath(defaults, def.path), true);
    n++;
  }
  return n;
}

export interface AuditRow {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

export async function listAudit(limit = 12): Promise<AuditRow[]> {
  const rows = await getSql()`SELECT key, old_value, new_value, changed_at FROM settings_audit ORDER BY id DESC LIMIT ${limit}`;
  return rows.map((r) => {
    const def = SETTING_DEFS.find((d) => d.key === r.key);
    const fmt = (v: unknown) => (typeof v === "boolean" ? (v ? "Dry run" : "Live") : def?.percent ? `${Math.round((v as number) * 1000) / 10}%` : `${v}${def?.unit && def.unit !== "×" ? " " + def.unit : def?.unit === "×" ? "×" : ""}`);
    return {
      key: r.key as string,
      label: r.key === PO_MODE_KEY ? "Purchase order mode" : def?.label ?? (r.key as string),
      oldValue: fmt(r.old_value),
      newValue: fmt(r.new_value),
      changedAt: new Date(r.changed_at as string).toISOString(),
    };
  });
}
