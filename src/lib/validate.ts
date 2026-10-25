import { config } from "@/config";

export type DataIssue =
  | "MISSING_INVENTORY"
  | "NO_SALES"
  | "SHORT_HISTORY"
  | "SALES_GAP"
  | "STALE_INVENTORY"
  | "STALE_SALES";

const DAY = 86_400_000;
const utc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

/** Monday of an ISO week "YYYY-Www" as a UTC timestamp. */
function isoWeekMonday(week: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`Bad week label: ${week}`);
  const year = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = Date.UTC(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  return jan4 - dow * DAY + (w - 1) * 7 * DAY;
}

/** Sunday (last day) of an ISO week, as YYYY-MM-DD. */
export function isoWeekEnd(week: string): string {
  return new Date(isoWeekMonday(week) + 6 * DAY).toISOString().slice(0, 10);
}

export interface SkuDataCheck {
  /** Week labels with sales, any order. */
  weeks: string[];
  /** null when there is no inventory row. */
  inventoryAsOf: string | null;
  asOf: string;
}

/** Flags missing or stale data for one SKU. Pure. */
export function validateSku(
  { weeks, inventoryAsOf, asOf }: SkuDataCheck,
  opts: { staleDays: number; minHistoryWeeks: number } = { staleDays: config.data.staleDays, minHistoryWeeks: config.rules.minHistoryWeeks },
): DataIssue[] {
  const issues: DataIssue[] = [];
  const { staleDays } = opts;

  if (inventoryAsOf === null) issues.push("MISSING_INVENTORY");
  else if ((utc(asOf) - utc(inventoryAsOf)) / DAY > staleDays) issues.push("STALE_INVENTORY");

  if (weeks.length === 0) {
    issues.push("NO_SALES");
    return issues;
  }
  const sorted = [...weeks].sort();
  if (sorted.length < opts.minHistoryWeeks) issues.push("SHORT_HISTORY");
  const mondays = sorted.map(isoWeekMonday);
  if (mondays.some((t, i) => i > 0 && t - mondays[i - 1] !== 7 * DAY)) issues.push("SALES_GAP");
  if ((utc(asOf) - utc(isoWeekEnd(sorted[sorted.length - 1]))) / DAY > staleDays) issues.push("STALE_SALES");
  return issues;
}
