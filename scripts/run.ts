import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runPlanning } = await import("../src/lib/run");
  const { getSql } = await import("../src/lib/db");
  const summary = await runPlanning("manual");
  console.log("Run summary:", JSON.stringify(summary));

  const sql = getSql();
  const recs = await sql`SELECT sku_id, flags, action, quantity, review_required, status,
      round((metrics->>'avg12')::numeric, 1) AS avg12, round((metrics->>'avg4')::numeric, 1) AS avg4,
      round((metrics->>'cover')::numeric, 1) AS cover
    FROM recommendations WHERE run_id = ${summary.runId} ORDER BY sku_id`;
  console.table(recs.map((r) => ({ ...r, flags: (r.flags as string[]).join(",") })));
}

main().catch((e) => {
  console.error("run failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
