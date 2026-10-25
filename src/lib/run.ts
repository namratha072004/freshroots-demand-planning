import { getSql } from "./db";
import { getAsOf } from "./asof";
import { isFestivalMonth } from "./calendar";
import { loadCsvFiles } from "./loadCsv";
import { assertNotStopped } from "./killSwitch";
import { runAiStep, type AiStepSummary } from "./ai/aiStep";
import { runLaunchStep, type LaunchStepSummary } from "./launches/step";
import { evaluateSku, type RuleResult } from "./rules";
import { validateSku, type DataIssue } from "./validate";

export type Trigger = "cron" | "manual";

export interface RunSummary {
  runId: number;
  asOf: string;
  festivalMonth: boolean;
  skuCount: number;
  recommendations: number;
  byAction: Record<string, number>;
  dataIssues: Record<string, number>;
  /** Gemini reasons and triage. A failure here never fails the run. */
  ai?: AiStepSummary;
  /** Sourced new-launch leads. A failure here never fails the run. */
  launches?: LaunchStepSummary;
  /** Milliseconds spent in each phase, to see where the time goes. */
  timingsMs?: { loadAndRules: number; save: number; ai: number; launches: number };
}

interface SkuRow {
  skuId: string;
  result: RuleResult;
  perishability: string;
  standardReorderQty: number;
  latestSalesWeek: string | null;
  unitsOnHand: number | null;
  inventoryAsOf: string | null;
  issues: DataIssue[];
}

/**
 * One planning run: load the files into Neon, organise one row per SKU, validate,
 * apply the rules, and save the flags. Never places or sends anything.
 * (Gemini reasons are added in checkpoint 6.)
 */
export async function runPlanning(trigger: Trigger): Promise<RunSummary> {
  // Kill switch: protects the next run. Scheduled and manual runs both refuse while stopped.
  await assertNotStopped();

  const sql = getSql();
  const asOf = getAsOf();

  const busy = await sql`SELECT 1 FROM runs WHERE status = 'running' AND started_at > now() - interval '10 minutes' LIMIT 1`;
  if (busy.length > 0) throw new Error("A run is already in progress");

  const [{ id }] = await sql`INSERT INTO runs (trigger, status, asof_date) VALUES (${trigger}, 'running', ${asOf}) RETURNING id`;
  const runId = Number(id);

  try {
    const t0 = Date.now();
    await loadCsvFiles();

    const [masters, sales, inventory, calendar] = await Promise.all([
      sql`SELECT sku_id, perishability, standard_reorder_qty FROM sku_master ORDER BY sku_id`,
      sql`SELECT sku_id, week, units_sold FROM weekly_sales ORDER BY sku_id, week`,
      sql`SELECT sku_id, sum(units_on_hand)::int AS units_on_hand, to_char(min(as_of_date), 'YYYY-MM-DD') AS as_of_date
          FROM current_inventory GROUP BY sku_id`,
      sql`SELECT year_month, is_festival_month FROM calendar`,
    ]);

    const festival = isFestivalMonth(
      calendar.map((c) => ({ yearMonth: c.year_month as string, isFestivalMonth: c.is_festival_month as boolean })),
      asOf,
    );

    const rows: SkuRow[] = masters.map((m) => {
      const skuSales = sales.filter((s) => s.sku_id === m.sku_id);
      const inv = inventory.find((i) => i.sku_id === m.sku_id);
      const weeks = skuSales.map((s) => s.week as string);
      const result = evaluateSku({
        skuId: m.sku_id as string,
        perishability: m.perishability as "Low" | "High",
        standardReorderQty: m.standard_reorder_qty as number,
        weeklySales: skuSales.map((s) => s.units_sold as number),
        unitsOnHand: inv ? (inv.units_on_hand as number) : null,
        isFestivalMonth: festival,
      });
      return {
        skuId: m.sku_id as string,
        result,
        perishability: m.perishability as string,
        standardReorderQty: m.standard_reorder_qty as number,
        latestSalesWeek: weeks.length ? weeks[weeks.length - 1] : null,
        unitsOnHand: inv ? (inv.units_on_hand as number) : null,
        inventoryAsOf: inv ? (inv.as_of_date as string) : null,
        issues: validateSku({ weeks, inventoryAsOf: inv ? (inv.as_of_date as string) : null, asOf }),
      };
    });

    const skuData = rows.map((r) => ({
      sku_id: r.skuId,
      perishability: r.perishability,
      standard_reorder_qty: r.standardReorderQty,
      weeks_of_history: r.result.metrics.weeksOfHistory,
      latest_sales_week: r.latestSalesWeek,
      avg12: r.result.metrics.avg12,
      avg4: r.result.metrics.avg4,
      units_on_hand: r.unitsOnHand,
      inventory_as_of: r.inventoryAsOf,
      data_issues: r.issues,
    }));

    const recs = rows
      .filter((r) => r.result.action !== "NONE")
      .map((r) => ({
        sku_id: r.skuId,
        flags: r.result.flags,
        action: r.result.action,
        quantity: r.result.quantity,
        review_required: r.result.reviewRequired,
        needs_raghav: r.result.action === "NEEDS_RAGHAV",
        needs_raghav_reason: r.result.needsRaghavReason,
        metrics: r.result.metrics,
        data_issues: r.issues,
      }));

    const byAction: Record<string, number> = {};
    for (const r of rows) byAction[r.result.action] = (byAction[r.result.action] ?? 0) + 1;
    const dataIssues: Record<string, number> = {};
    for (const r of rows) for (const i of r.issues) dataIssues[i] = (dataIssues[i] ?? 0) + 1;

    const summary: RunSummary = {
      runId,
      asOf,
      festivalMonth: festival,
      skuCount: rows.length,
      recommendations: recs.length,
      byAction,
      dataIssues,
    };

    const t1 = Date.now();
    // One transaction: D2 (earlier PENDING -> SUPERSEDED), save the organised rows and the flags.
    await sql.transaction([
      sql`UPDATE recommendations SET status = 'SUPERSEDED' WHERE status = 'PENDING' AND run_id <> ${runId}`,
      sql`INSERT INTO run_sku_data (run_id, sku_id, perishability, standard_reorder_qty, weeks_of_history,
            latest_sales_week, avg12, avg4, units_on_hand, inventory_as_of, data_issues)
          SELECT ${runId}::bigint, x.sku_id, x.perishability, x.standard_reorder_qty, x.weeks_of_history,
                 x.latest_sales_week, x.avg12, x.avg4, x.units_on_hand, x.inventory_as_of,
                 ARRAY(SELECT jsonb_array_elements_text(x.data_issues))
          FROM jsonb_to_recordset(${JSON.stringify(skuData)}::jsonb) AS x(
            sku_id text, perishability text, standard_reorder_qty int, weeks_of_history int,
            latest_sales_week text, avg12 numeric, avg4 numeric, units_on_hand int,
            inventory_as_of date, data_issues jsonb)`,
      sql`INSERT INTO recommendations (run_id, sku_id, flags, action, quantity, review_required, needs_raghav,
            needs_raghav_reason, metrics, data_issues)
          SELECT ${runId}::bigint, x.sku_id, ARRAY(SELECT jsonb_array_elements_text(x.flags)), x.action, x.quantity,
                 x.review_required, x.needs_raghav, x.needs_raghav_reason, x.metrics,
                 ARRAY(SELECT jsonb_array_elements_text(x.data_issues))
          FROM jsonb_to_recordset(${JSON.stringify(recs)}::jsonb) AS x(
            sku_id text, flags jsonb, action text, quantity int, review_required boolean, needs_raghav boolean,
            needs_raghav_reason text, metrics jsonb, data_issues jsonb)`,
      sql`UPDATE runs SET status = 'completed', finished_at = now(), festival_month = ${festival},
            summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`,
    ]);

    const t2 = Date.now();
    // Gemini step last: the flags are already saved, so a failure here only means flags without reasons.
    // The two Gemini steps are independent, so they run side by side to stay inside the time limit.
    const timed = async <T,>(f: () => Promise<T>): Promise<[T, number]> => {
      const s = Date.now();
      return [await f(), Date.now() - s];
    };
    const [[ai, aiMs], [launches, launchMs]] = await Promise.all([timed(() => runAiStep(runId)), timed(() => runLaunchStep(runId))]);
    summary.ai = ai;
    summary.launches = launches;
    summary.timingsMs = { loadAndRules: t1 - t0, save: t2 - t1, ai: aiMs, launches: launchMs };
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`UPDATE runs SET status = 'failed', finished_at = now(), error = ${message} WHERE id = ${runId}`;
    throw e;
  }
}
