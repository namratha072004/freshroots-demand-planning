/**
 * Integration check of the draft-PO safeguards against the real database, with a pretend Zoho (no real Zoho calls).
 * DESTRUCTIVE: it deletes all runs, recommendations, draft POs and kill-switch events. Only run it on a development
 * database:  CONFIRM_WIPE=yes npx tsx scripts/check-po-flow.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
if (process.env.CONFIRM_WIPE !== "yes") {
  console.error("Refusing to run: this wipes runs, flags, draft POs and kill-switch events. Re-run with CONFIRM_WIPE=yes on a dev database.");
  process.exit(3);
}

type PO = { purchaseorder_id: string; purchaseorder_number: string; status: string; reference_number?: string };
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };

async function main() {
  const { getSql } = await import("../src/lib/db");
  const { createDraftPo } = await import("../src/lib/zoho/draftPo");
  const { ZohoError } = await import("../src/lib/zoho/client");
  const sql = getSql();

  const reset = async () => { await sql`DELETE FROM draft_purchase_orders`; await sql`DELETE FROM runs`; await sql`DELETE FROM kill_switch_events`; };
  const seed = async () => {
    await reset();
    const [{ id }] = await sql`INSERT INTO runs (trigger, status, asof_date) VALUES ('manual', 'completed', '2026-10-19') RETURNING id`;
    const mk = (sku: string, action: string, qty: number | null, status: string) => sql`INSERT INTO recommendations (run_id, sku_id, flags, action, quantity, metrics, status, decided_at)
      VALUES (${id}, ${sku}, '{}', ${action}, ${qty}, '{}'::jsonb, ${status}, ${status === "PENDING" ? null : new Date().toISOString()})`;
    await mk("SKU001", "ORDER_NOW", 750, "APPROVED"); await mk("SKU004", "ORDER_NOW", 150, "APPROVED"); await mk("SKU011", "ORDER_NOW", 500, "APPROVED");
    await mk("SKU006", "PAUSE_ORDER", null, "APPROVED");   // approved but not an order
    await mk("SKU003", "ORDER_NOW", 300, "PENDING");        // not decided
    await sql`INSERT INTO recommendations (run_id, sku_id, flags, action, quantity, metrics, status, rejection_reason, decided_at) VALUES (${id}, 'SKU013', '{}', 'ORDER_NOW', 120, '{}'::jsonb, 'REJECTED', 'my_judgment', now())`;
  };
  const counts = async () => {
    const [r] = await sql`SELECT (SELECT count(*)::int FROM draft_purchase_orders WHERE status IN ('creating','unknown','created')) AS live,
      (SELECT count(*)::int FROM draft_purchase_orders WHERE status = 'dry_run') AS dry,
      (SELECT count(*)::int FROM recommendations WHERE draft_po_id IS NOT NULL) AS locked`;
    return r as { live: number; dry: number; locked: number };
  };

  function fake(opts: { post?: (n: number) => PO | Error; existing?: PO | null; vendor?: boolean } = {}) {
    const log = { posts: 0, lookups: 0 };
    const client = {
      listItems: async () => [],
      findVendorByName: async () => (opts.vendor === false ? null : { contact_id: "VENDOR1", contact_name: "Freshroots Default Vendor", status: "active" }),
      findPoByReference: async () => { log.lookups++; return opts.existing ?? null; },
      createPurchaseOrder: async (payload: { reference_number: string }) => {
        log.posts++;
        const r = opts.post ? opts.post(log.posts) : { purchaseorder_id: "ZPO" + log.posts, purchaseorder_number: "PO-0000" + log.posts, status: "draft", reference_number: payload.reference_number };
        if (r instanceof Error) throw r;
        return r;
      },
    };
    return { client: client as never, log };
  }

  console.log("== 1. kill switch blocks creation");
  await seed(); await sql`INSERT INTO kill_switch_events (kind, approved, rejected, decided, rate) VALUES ('STOPPED', 3, 1, 4, 0.25)`;
  let f = fake(); let r = await createDraftPo(f.client);
  check("blocked while stopped, nothing sent", !r.ok && /kill switch/i.test(r.message) && f.log.posts === 0, !r.ok ? r.message.slice(0, 60) : "");
  await sql`DELETE FROM kill_switch_events`;

  console.log("== 2. dry run: shows the request, creates nothing, consumes nothing");
  process.env.ZOHO_DRY_RUN = "true"; f = fake(); r = await createDraftPo(f.client);
  check("dry run result with 3 lines (approved ORDER_NOW only)", r.ok && r.mode === "dry_run" && r.lines.length === 3 && r.lines.map((l) => l.skuId).join() === "SKU001,SKU004,SKU011");
  check("no POST to Zoho", f.log.posts === 0);
  check("payload has item ids + quantities, vendor, reference, no price", r.ok && r.mode === "dry_run" && r.payload.vendor_id === "VENDOR1" && r.payload.line_items.length === 3 && !("rate" in r.payload.line_items[0]) && /^FR-/.test(r.payload.reference_number));
  let c = await counts(); check("lines not consumed (still available)", c.locked === 0 && c.live === 0 && c.dry === 1, JSON.stringify(c));
  process.env.ZOHO_DRY_RUN = "false";

  console.log("== 3. real create, then the same batch can never be created twice");
  f = fake(); r = await createDraftPo(f.client);
  check("created with Zoho id and number, status draft", r.ok && r.mode === "created" && r.po.zohoPoId === "ZPO1" && r.po.zohoStatus === "draft" && !r.warning);
  c = await counts(); check("3 lines locked to the PO, one live row", c.locked === 3 && c.live === 1, JSON.stringify(c));
  r = await createDraftPo(f.client);
  check("clicking again: nothing left to create", !r.ok && /no approved/i.test(r.message) && f.log.posts === 1);

  console.log("== 4. double click (two requests at once) -> exactly one PO");
  await seed(); f = fake();
  const both = await Promise.all([createDraftPo(f.client), createDraftPo(f.client)]);
  check("exactly one POST to Zoho", f.log.posts === 1, `posts=${f.log.posts}`);
  c = await counts(); check("one live row", c.live === 1, JSON.stringify(c));
  check("the other click did not create a second", both.filter((x) => x.ok && x.mode === "created").length === 1, both.map((x) => (x.ok ? x.mode : "blocked")).join(" / "));

  console.log("== 5. Zoho answers with an error: nothing created, lines released, retry works");
  await seed(); f = fake({ post: (n) => (n === 1 ? new ZohoError("Zoho said: Invalid value (code 1001)", true, 400) : { purchaseorder_id: "ZPO2", purchaseorder_number: "PO-2", status: "draft" }) });
  r = await createDraftPo(f.client);
  check("reported the Zoho error", !r.ok && /Invalid value/.test(r.message));
  c = await counts(); check("lines released, no live row", c.locked === 0 && c.live === 0, JSON.stringify(c));
  r = await createDraftPo(f.client); check("retry creates it", r.ok && r.mode === "created" && f.log.posts === 2);

  console.log("== 6. network drops mid-create (not known if Zoho made it)");
  await seed(); f = fake({ post: () => new ZohoError("No answer from Zoho: fetch failed", false) });
  r = await createDraftPo(f.client);
  check("flagged as needing a re-check", !r.ok && r.needsRetry === true);
  c = await counts(); check("lines stay locked, row is 'unknown'", c.locked === 3 && c.live === 1, JSON.stringify(c));
  const [u] = await sql`SELECT status FROM draft_purchase_orders ORDER BY id DESC LIMIT 1`; check("row status unknown", u.status === "unknown");
  console.log("   6a. Zoho DID create it -> the retry finds it and never POSTs again");
  const [ref] = await sql`SELECT reference_number FROM draft_purchase_orders ORDER BY id DESC LIMIT 1`;
  const f2 = fake({ existing: { purchaseorder_id: "FOUND1", purchaseorder_number: "PO-FOUND", status: "draft", reference_number: ref.reference_number as string } });
  // the old 'unknown' row is older than the guard window only if > 2 min; unknown rows are always resolvable
  r = await createDraftPo(f2.client);
  check("found the existing PO by reference, no second POST", r.ok && r.mode === "already_created" && r.po.zohoPoId === "FOUND1" && f2.log.posts === 0, `lookups=${f2.log.lookups} posts=${f2.log.posts}`);
  console.log("   6b. Zoho did NOT create it -> the retry creates it once");
  await seed(); f = fake({ post: (n) => (n === 1 ? new ZohoError("No answer from Zoho: fetch failed", false) : { purchaseorder_id: "ZPO9", purchaseorder_number: "PO-9", status: "draft" }) });
  await createDraftPo(f.client); r = await createDraftPo(f.client);
  check("retry looked first, then created exactly once more", r.ok && r.mode === "created" && f.log.lookups === 1 && f.log.posts === 2, `lookups=${f.log.lookups} posts=${f.log.posts}`);
  c = await counts(); check("one live row, 3 lines locked", c.live === 1 && c.locked === 3, JSON.stringify(c));

  console.log("== 7. Zoho creates it with a status other than draft -> loud warning");
  await seed(); f = fake({ post: () => ({ purchaseorder_id: "Z", purchaseorder_number: "PO-X", status: "open" }) });
  r = await createDraftPo(f.client);
  check("warning raised and stored", r.ok && r.mode === "created" && /not "draft"/.test(r.warning ?? ""));

  console.log("== 8. vendor missing in Zoho");
  await seed(); f = fake({ vendor: false }); r = await createDraftPo(f.client);
  check("clear error, nothing reserved, nothing sent", !r.ok && /vendor/i.test(r.message) && f.log.posts === 0 && (await counts()).live === 0);

  console.log("== 9. nothing approved");
  await reset(); r = await createDraftPo(fake().client);
  check("no lines -> clear message", !r.ok && /no approved/i.test(r.message));

  await reset();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("script error:", e); process.exit(2); });
