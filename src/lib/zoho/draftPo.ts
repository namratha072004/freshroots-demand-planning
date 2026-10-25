import { config } from "@/config";
import { getSql } from "../db";
import { assertNotStopped } from "../killSwitch";
import { getZohoDryRun } from "../settings";
import { buildBatch, buildPayload, type Batch } from "./batch";
import { ZohoClient, ZohoError, zohoEnv, type PoPayload } from "./client";

export interface DraftPoRow {
  id: number;
  status: "creating" | "created" | "unknown" | "failed" | "dry_run";
  referenceNumber: string;
  zohoPoId: string | null;
  zohoPoNumber: string | null;
  zohoStatus: string | null;
  error: string | null;
  lines: { skuId: string; quantity: number }[];
  createdAt: string;
}

export type CreateResult =
  | { ok: true; mode: "created" | "already_created"; po: DraftPoRow; warning?: string }
  | { ok: true; mode: "dry_run"; payload: PoPayload; lines: { skuId: string; quantity: number }[] }
  | { ok: false; message: string; needsRetry?: boolean };

/** Approved ORDER_NOW lines that are not in a draft PO yet. */
export async function getReadyBatch(): Promise<Batch | null> {
  const sql = getSql();
  const rows = await sql`SELECT id, sku_id, quantity, decided_at FROM recommendations
    WHERE status = 'APPROVED' AND action = 'ORDER_NOW' AND draft_po_id IS NULL AND quantity IS NOT NULL`;
  return buildBatch(
    rows.map((r) => ({
      recommendationId: Number(r.id),
      skuId: r.sku_id as string,
      quantity: r.quantity as number,
      decidedAt: new Date(r.decided_at as string),
    })),
  );
}

/** Fetch Zoho items by SKU and store the SKU -> item id mapping. */
export async function syncZohoItems(client: ZohoClient): Promise<{ mapped: number; missing: string[] }> {
  const sql = getSql();
  const [items, skus] = await Promise.all([client.listItems(), sql`SELECT sku_id FROM sku_master ORDER BY sku_id`]);
  const bySku = new Map(items.filter((i) => i.status === "active" && i.sku).map((i) => [i.sku, i]));
  const found = skus.map((s) => s.sku_id as string).filter((id) => bySku.has(id));
  if (found.length) {
    const rows = found.map((id) => ({ sku_id: id, zoho_item_id: bySku.get(id)!.item_id, item_name: bySku.get(id)!.name }));
    await sql`INSERT INTO zoho_item_map (sku_id, zoho_item_id, item_name, synced_at)
      SELECT x.sku_id, x.zoho_item_id, x.item_name, now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(sku_id text, zoho_item_id text, item_name text)
      ON CONFLICT (sku_id) DO UPDATE SET zoho_item_id = EXCLUDED.zoho_item_id, item_name = EXCLUDED.item_name, synced_at = now()`;
  }
  return { mapped: found.length, missing: skus.map((s) => s.sku_id as string).filter((id) => !bySku.has(id)) };
}

async function itemMap(): Promise<Map<string, string>> {
  const rows = await getSql()`SELECT sku_id, zoho_item_id FROM zoho_item_map`;
  return new Map(rows.map((r) => [r.sku_id as string, r.zoho_item_id as string]));
}

const toRow = (r: Record<string, unknown>): DraftPoRow => ({
  id: Number(r.id),
  status: r.status as DraftPoRow["status"],
  referenceNumber: r.reference_number as string,
  zohoPoId: r.zoho_po_id as string | null,
  zohoPoNumber: r.zoho_po_number as string | null,
  zohoStatus: r.zoho_status as string | null,
  error: r.error as string | null,
  lines: ((r.lines as { skuId: string; quantity: number }[]) ?? []).map((l) => ({ skuId: l.skuId, quantity: l.quantity })),
  createdAt: new Date(r.created_at as string).toISOString(),
});

export async function listDraftPos(limit = 10): Promise<DraftPoRow[]> {
  const rows = await getSql()`SELECT * FROM draft_purchase_orders WHERE status <> 'dry_run' ORDER BY id DESC LIMIT ${limit}`;
  return rows.map(toRow);
}

async function markCreated(id: number, po: { purchaseorder_id: string; purchaseorder_number: string; status: string }): Promise<DraftPoRow> {
  const notDraft = po.status.toLowerCase() !== "draft";
  const rows = await getSql()`UPDATE draft_purchase_orders SET status = 'created', zoho_po_id = ${po.purchaseorder_id},
      zoho_po_number = ${po.purchaseorder_number}, zoho_status = ${po.status}, updated_at = now(),
      error = ${notDraft ? `Zoho reports status "${po.status}", not "draft". Check this PO in Zoho.` : null}
    WHERE id = ${id} RETURNING *`;
  return toRow(rows[0]);
}

/** Send the create request for a reserved row and record exactly what happened. */
async function sendAndRecord(zoho: ZohoClient, rowId: number, payload: PoPayload): Promise<CreateResult> {
  const sql = getSql();
  try {
    const po = await zoho.createPurchaseOrder(payload);
    const row = await markCreated(rowId, po);
    return { ok: true, mode: "created", po: row, warning: row.error ?? undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof ZohoError && e.answered) {
      // Zoho answered with an error: nothing was created. Release the lines so the batch can be retried.
      await sql`UPDATE recommendations SET draft_po_id = NULL WHERE draft_po_id = ${rowId}`;
      await sql`UPDATE draft_purchase_orders SET status = 'failed', error = ${message}, updated_at = now() WHERE id = ${rowId}`;
      return { ok: false, message };
    }
    // No answer: Zoho may or may not have created it. Keep the lines locked; the next click checks first.
    await sql`UPDATE draft_purchase_orders SET status = 'unknown', error = ${message}, updated_at = now() WHERE id = ${rowId}`;
    return {
      ok: false,
      needsRetry: true,
      message: `${message}. It is not known whether Zoho created the PO. Press the button again: it checks Zoho first and never creates a second one.`,
    };
  }
}

/** An earlier attempt that never finished (network drop). Returns it so it can be resolved before anything new is created. */
export async function getPendingAttempt(): Promise<{ id: number; referenceNumber: string; status: string; updatedAt: Date; lines: { skuId: string; quantity: number }[]; vendorId: string | null } | null> {
  const rows = await getSql()`SELECT id, reference_number, status, updated_at, lines, vendor_id FROM draft_purchase_orders
    WHERE status IN ('unknown', 'creating') ORDER BY id LIMIT 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    referenceNumber: r.reference_number as string,
    status: r.status as string,
    updatedAt: new Date(r.updated_at as string),
    lines: r.lines as { skuId: string; quantity: number }[],
    vendorId: r.vendor_id as string | null,
  };
}

/** Resolve an unfinished attempt: look in Zoho first; only if the PO is not there, create it (once). */
async function resumePending(zoho: ZohoClient, p: NonNullable<Awaited<ReturnType<typeof getPendingAttempt>>>): Promise<CreateResult> {
  const sql = getSql();
  if (p.status === "creating" && Date.now() - p.updatedAt.getTime() < 120_000) {
    return { ok: false, message: "This draft PO is being created right now. Wait a moment and reload." };
  }
  const found = await zoho.findPoByReference(p.referenceNumber);
  if (found) return { ok: true, mode: "already_created", po: await markCreated(p.id, found) };

  let map = await itemMap();
  if (p.lines.some((l) => !map.has(l.skuId))) {
    await syncZohoItems(zoho);
    map = await itemMap();
  }
  const vendor = p.vendorId ?? (await zoho.findVendorByName(config.zoho.defaultVendorName))?.contact_id;
  if (!vendor) return { ok: false, message: `The vendor "${config.zoho.defaultVendorName}" was not found (or is inactive) in Zoho.` };
  const payload = buildPayload(
    { lines: p.lines.map((l) => ({ ...l, recommendationId: 0 })), recommendationIds: [], batchKey: "", referenceNumber: p.referenceNumber },
    vendor,
    map,
  );
  await sql`UPDATE draft_purchase_orders SET status = 'creating', updated_at = now() WHERE id = ${p.id}`;
  return sendAndRecord(zoho, p.id, payload);
}

/**
 * Create ONE draft purchase order in Zoho for the approved ORDER_NOW lines. Called only from the button.
 * Guards: kill switch, one live PO per batch (so it can never be created twice), a reference number that lets
 * us find the PO again after a network failure, and no way to issue, send or approve it.
 */
export async function createDraftPo(client?: ZohoClient): Promise<CreateResult> {
  try {
    await assertNotStopped();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Blocked by the kill switch" };
  }

  const sql = getSql();
  try {
    const zoho = client ?? new ZohoClient(zohoEnv());

    // An unfinished earlier attempt always comes first: its lines are still locked to it.
    const pending = await getPendingAttempt();
    if (pending) {
      if (await getZohoDryRun()) return { ok: false, message: "An earlier draft PO attempt is unresolved. Turn dry run off to re-check it in Zoho." };
      return await resumePending(zoho, pending);
    }

    const batch = await getReadyBatch();
    if (!batch) return { ok: false, message: "There are no approved ORDER_NOW lines waiting for a draft PO." };

    let map = await itemMap();
    if (batch.lines.some((l) => !map.has(l.skuId))) {
      await syncZohoItems(zoho);
      map = await itemMap();
    }
    const vendor = await zoho.findVendorByName(config.zoho.defaultVendorName);
    if (!vendor) return { ok: false, message: `The vendor "${config.zoho.defaultVendorName}" was not found (or is inactive) in Zoho.` };
    const payload = buildPayload(batch, vendor.contact_id, map);
    const lines = batch.lines.map((l) => ({ skuId: l.skuId, quantity: l.quantity }));

    if (await getZohoDryRun()) {
      await sql`INSERT INTO draft_purchase_orders (batch_key, reference_number, status, recommendation_ids, lines, vendor_id)
        VALUES (${batch.batchKey}, ${batch.referenceNumber}, 'dry_run', ${batch.recommendationIds}::bigint[], ${JSON.stringify(lines)}::jsonb, ${vendor.contact_id})`;
      return { ok: true, mode: "dry_run", payload, lines };
    }

    // Reserve the batch. The partial unique index allows only one live row per batch.
    const inserted = await sql`INSERT INTO draft_purchase_orders (batch_key, reference_number, status, recommendation_ids, lines, vendor_id)
      VALUES (${batch.batchKey}, ${batch.referenceNumber}, 'creating', ${batch.recommendationIds}::bigint[], ${JSON.stringify(lines)}::jsonb, ${vendor.contact_id})
      ON CONFLICT (batch_key) WHERE status IN ('creating', 'unknown', 'created') DO NOTHING RETURNING id`;

    if (inserted.length === 0) {
      // Another click reserved this exact batch a moment ago. Never create a second PO for it.
      const [existing] = await sql`SELECT * FROM draft_purchase_orders WHERE batch_key = ${batch.batchKey} AND status IN ('creating', 'unknown', 'created') LIMIT 1`;
      if (existing?.status === "created") return { ok: true, mode: "already_created", po: toRow(existing) };
      return { ok: false, message: "This draft PO is being created right now. Wait a moment and reload." };
    }

    const rowId = Number(inserted[0].id);
    const locked = await sql`UPDATE recommendations SET draft_po_id = ${rowId}
      WHERE id = ANY(${batch.recommendationIds}::bigint[]) AND draft_po_id IS NULL AND status = 'APPROVED' RETURNING id`;
    if (locked.length !== batch.recommendationIds.length) {
      await sql`UPDATE recommendations SET draft_po_id = NULL WHERE draft_po_id = ${rowId}`;
      await sql`UPDATE draft_purchase_orders SET status = 'failed', error = 'Some lines were taken by another draft PO', updated_at = now() WHERE id = ${rowId}`;
      return { ok: false, message: "Some of these lines were just used by another draft PO. Reload and try again." };
    }
    return await sendAndRecord(zoho, rowId, payload);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
