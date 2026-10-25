/**
 * Checks the edit-the-order-quantity logic against the real database WITHOUT touching real data: it creates its own
 * temporary run and recommendations (marked with a unique run) and deletes only those when it finishes.
 *   npx tsx scripts/check-quantity-edit.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };
const fails = async (f: () => Promise<unknown>, msg: RegExp) => { try { await f(); return false; } catch (e) { return msg.test(e instanceof Error ? e.message : String(e)); } };

async function main() {
  const { getSql } = await import("../src/lib/db");
  const { approveRecommendation, setApprovedQuantity, rejectRecommendation } = await import("../src/lib/decisions");
  const { getReadyBatch } = await import("../src/lib/zoho/draftPo");
  const sql = getSql();

  // A private run that is not 'completed', so no dashboard page ever shows it.
  const [{ id: runId }] = await sql`INSERT INTO runs (trigger, status, asof_date) VALUES ('manual', 'failed', '2026-10-19') RETURNING id`;
  const mk = async (sku: string, action: string, qty: number | null) => {
    const [r] = await sql`INSERT INTO recommendations (run_id, sku_id, flags, action, quantity, metrics, status) VALUES (${runId}, ${sku}, '{}', ${action}, ${qty}, '{}'::jsonb, 'PENDING') RETURNING id`;
    return Number(r.id);
  };
  const state = async (id: number) => (await sql`SELECT status, quantity, approved_quantity, draft_po_id FROM recommendations WHERE id = ${id}`)[0];
  const audit = async (id: number) => (await sql`SELECT old_quantity, new_quantity FROM quantity_audit WHERE recommendation_id = ${id} ORDER BY id`) as { old_quantity: number; new_quantity: number }[];
  let poRow: number | null = null;

  try {
    const a = await mk("ZZ_T1", "ORDER_NOW", 750);   // approved with a lower quantity
    const b = await mk("ZZ_T2", "ORDER_NOW", 150);   // approved as recommended
    const c = await mk("ZZ_T3", "ORDER_NOW", 500);   // approved, then edited
    const p = await mk("ZZ_T4", "PAUSE_ORDER", null); // not an order
    const d = await mk("ZZ_T5", "ORDER_NOW", 120);   // rejected
    const e = await mk("ZZ_T6", "ORDER_NOW", 200);   // invalid quantities

    console.log("== approve with the planner's quantity");
    await approveRecommendation(a, { quantity: 300, reason: "stock_inbound", note: "2 pallets arriving Friday" });
    let s = await state(a);
    check("recommendation kept (750), planner's number stored (300)", s.quantity === 750 && s.approved_quantity === 300 && s.status === "APPROVED", JSON.stringify(s));
    check("the edit is logged 750 -> 300", JSON.stringify(await audit(a)) === JSON.stringify([{ old_quantity: 750, new_quantity: 300 }]));
    const [why] = await sql`SELECT adjustment_reason, adjustment_note FROM recommendations WHERE id = ${a}`;
    check("the reason and note are stored with it", why.adjustment_reason === "stock_inbound" && why.adjustment_note === "2 pallets arriving Friday");
    const [qa] = await sql`SELECT reason, note FROM quantity_audit WHERE recommendation_id = ${a}`;
    check("and in the change history", qa.reason === "stock_inbound");

    await approveRecommendation(b, { quantity: 150, reason: "my_judgment" });
    s = await state(b);
    check("approving the recommended number is not an edit", s.approved_quantity === null && (await audit(b)).length === 0);
    await approveRecommendation(c);
    check("approving with no quantity keeps the recommendation", (await state(c)).approved_quantity === null);

    console.log("== the draft PO batch uses the planner's quantity");
    const batch = await getReadyBatch();
    const mine = batch?.lines.filter((l) => l.skuId.startsWith("ZZ_T")) ?? [];
    check("ZZ_T1 goes in at 300, not 750", mine.find((l) => l.skuId === "ZZ_T1")?.quantity === 300, JSON.stringify(mine.map((l) => [l.skuId, l.quantity])));
    check("ZZ_T2 goes in at its recommendation", mine.find((l) => l.skuId === "ZZ_T2")?.quantity === 150);

    console.log("== change the quantity after approving, before any PO");
    await setApprovedQuantity(c, { quantity: 400, reason: "demand_change" });
    s = await state(c);
    check("edit after approval stored", s.approved_quantity === 400 && s.quantity === 500);
    await setApprovedQuantity(c, { quantity: 450, reason: "budget_limit", note: "cash is tight" });
    check("editing again works and every step is logged", JSON.stringify(await audit(c)) === JSON.stringify([{ old_quantity: 500, new_quantity: 400 }, { old_quantity: 400, new_quantity: 450 }]));
    await setApprovedQuantity(c, { quantity: 500, reason: "data_wrong" });
    check("setting it back to the recommendation clears the edit", (await state(c)).approved_quantity === null);
    check("an unchanged value writes nothing", (await (async () => { const n = (await audit(c)).length; await setApprovedQuantity(c, { quantity: 500, reason: "data_wrong" }); return (await audit(c)).length === n; })()));

    console.log("== once a draft PO carries the line it is locked");
    const [po] = await sql`INSERT INTO draft_purchase_orders (batch_key, reference_number, status, recommendation_ids, lines) VALUES ('zz-test', 'FR-ZZTEST', 'failed', ARRAY[${a}]::bigint[], '[]'::jsonb) RETURNING id`;
    poRow = Number(po.id);
    await sql`UPDATE recommendations SET draft_po_id = ${poRow} WHERE id = ${a}`;
    check("changing a quantity already in a draft PO is refused", await fails(() => setApprovedQuantity(a, { quantity: 999, reason: "my_judgment" }), /draft PO/i));
    check("and its number did not move", (await state(a)).approved_quantity === 300);

    console.log("== a change must come with a reason");
    check("an approval with a new quantity and no reason is refused", await fails(() => approveRecommendation(e, { quantity: 99 }), /reason/i));
    check("an approval with an unknown reason is refused", await fails(() => approveRecommendation(e, { quantity: 99, reason: "because" }), /reason/i));
    check("an edit after approval with no reason is refused", await fails(() => setApprovedQuantity(b, { quantity: 99 }), /reason/i));
    check("the flag stayed pending / unchanged after those refusals", (await state(e)).status === "PENDING" && (await state(b)).approved_quantity === null);

    await rejectRecommendation(d, "my_judgment");
    console.log("== every action is in the activity log");
    const logs = async (rid: number) => (await sql`SELECT kind, actor, summary, details FROM activity_log WHERE recommendation_id = ${rid} ORDER BY id`) as { kind: string; actor: string; summary: string; details: Record<string, unknown> }[];
    const la = await logs(a);
    check("approving with an edit logs one entry with both numbers, the delta and the reason", la.length === 1 && la[0].kind === "decision.approved" && la[0].actor === "planner" && la[0].details.suggested === 750 && la[0].details.ordered === 300 && la[0].details.delta_units === -450 && la[0].details.delta_percent === -60 && la[0].details.reason === "stock_inbound", la[0]?.summary);
    check("the summary reads naturally", /Approved ZZ_T1 at 300 units instead of the suggested 750/.test(la[0].summary) && /Stock is already on the way/.test(la[0].summary));
    const lb = await logs(b);
    check("approving as suggested logs 'as suggested'", lb.length === 1 && /as suggested/.test(lb[0].summary));
    const lc = await logs(c);
    check("each later edit is logged as a quantity change (3 edits)", lc.filter((x) => x.kind === "quantity.adjusted").length === 3, String(lc.length));
    check("a rejection is logged with its reason", (await logs(d)).some((x) => x.kind === "decision.rejected" && /my own judgment/i.test(x.summary)));
    check("refused actions wrote no log entry", (await logs(e)).length === 0);

    console.log("== things that must be refused");
    check("a pending flag cannot be edited before it is approved", await fails(() => setApprovedQuantity(e, { quantity: 250, reason: "my_judgment" }), /only an approved order/i));
    check("a pause order has no quantity", await fails(() => approveRecommendation(p, { quantity: 100, reason: "my_judgment" }), /only an order/i));
    for (const [bad, msg] of [[0, /at least 1/], [-4, /at least 1/], [12.5, /whole number/], ["abc", /number/], [2_000_000, /more than/]] as const) {
      check(`approving with quantity ${JSON.stringify(bad)} is refused`, await fails(() => approveRecommendation(e, { quantity: bad, reason: "my_judgment" }), msg));
    }
    check("a refused approval leaves the flag pending", (await state(e)).status === "PENDING");
    check("a rejected order cannot have its quantity changed", await fails(() => setApprovedQuantity(d, { quantity: 50, reason: "my_judgment" }), /only an approved order/i));
    check("a flag can only be decided once", await fails(() => approveRecommendation(a, { quantity: 100, reason: "my_judgment" }), /no longer be decided/i));
  } finally {
    await sql`UPDATE recommendations SET draft_po_id = NULL WHERE run_id = ${runId}`;
    if (poRow) await sql`DELETE FROM draft_purchase_orders WHERE id = ${poRow}`;
    await sql`DELETE FROM runs WHERE id = ${runId}`; // recommendations and audit rows go with it
    await sql`DELETE FROM activity_log WHERE sku_id LIKE 'ZZ_T%'`;
    const left = await sql`SELECT (SELECT count(*)::int FROM recommendations WHERE sku_id LIKE 'ZZ_T%') AS recs, (SELECT count(*)::int FROM draft_purchase_orders WHERE batch_key = 'zz-test') AS pos, (SELECT count(*)::int FROM activity_log WHERE sku_id LIKE 'ZZ_T%') AS logs`;
    console.log(`cleanup: ${left[0].recs} test recommendations, ${left[0].pos} test POs and ${left[0].logs} test log entries left (all should be 0)`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("script error:", e); process.exit(2); });
