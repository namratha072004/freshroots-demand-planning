import { ADJUSTMENT_LABELS } from "./adjustmentReasons";
import { logActivity } from "./activity";
import { getSql } from "./db";
import { describeDelta, parseAdjustment } from "./quantity";
import { REJECTION_LABELS, REJECTION_REASONS, type RejectionReason } from "./rejectionReasons";

export { REJECTION_LABELS, REJECTION_REASONS, type RejectionReason };

export function parseRejectionReason(value: unknown): RejectionReason {
  if (typeof value === "string" && (REJECTION_REASONS as readonly string[]).includes(value)) {
    return value as RejectionReason;
  }
  throw new Error("Pick a reason for rejecting");
}

const sign = (n: number) => (n > 0 ? `+${n.toLocaleString("en-IN")}` : n.toLocaleString("en-IN"));
const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
const nameOf = (sku: string, name: string | null) => `${sku}${name ? ` (${name})` : ""}`;

/**
 * Approve a PENDING recommendation (not NEEDS_RAGHAV), once. Called plain, it approves what the rules suggested.
 * For an ORDER_NOW flag the planner may pass an adjustment ({ quantity, reason, note }): the suggestion is kept, the
 * planner's number and the reason are stored beside it, and the order uses the planner's number.
 */
export async function approveRecommendation(id: number, adjustment?: unknown): Promise<void> {
  const sql = getSql();
  const [rec] = await sql`SELECT r.action, r.quantity, r.sku_id, r.run_id, m.sku_name FROM recommendations r
    LEFT JOIN sku_master m ON m.sku_id = r.sku_id
    WHERE r.id = ${id} AND r.status = 'PENDING' AND r.action <> 'NEEDS_RAGHAV'`;
  if (!rec) throw new Error("This flag can no longer be decided");

  let adj: { quantity: number; reason: string; note: string | null } | null = null;
  if (adjustment !== undefined && adjustment !== null) {
    if (rec.action !== "ORDER_NOW") throw new Error("Only an order has a quantity.");
    const p = parseAdjustment(adjustment as never);
    if (!p.ok) throw new Error(p.error);
    if (p.value.quantity !== rec.quantity) adj = p.value; // the same number as suggested is just an approval
  }

  const rows = await sql`UPDATE recommendations SET status = 'APPROVED', decided_at = now(), approved_quantity = ${adj?.quantity ?? null},
      adjustment_reason = ${adj?.reason ?? null}, adjustment_note = ${adj?.note ?? null}
    WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV' RETURNING id`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");

  const who = nameOf(rec.sku_id as string, rec.sku_name as string | null);
  if (adj) {
    const d = describeDelta(rec.quantity as number, adj.quantity);
    await sql`INSERT INTO quantity_audit (recommendation_id, old_quantity, new_quantity, reason, note) VALUES (${id}, ${rec.quantity}, ${adj.quantity}, ${adj.reason}, ${adj.note})`;
    await logActivity({
      kind: "decision.approved",
      summary: `Approved ${who} at ${adj.quantity.toLocaleString("en-IN")} units instead of the suggested ${(rec.quantity as number).toLocaleString("en-IN")} (${sign(d.units)}, ${pct(d.percent)}). Reason: ${ADJUSTMENT_LABELS[adj.reason as keyof typeof ADJUSTMENT_LABELS]}${adj.note ? ` — ${adj.note}` : ""}`,
      details: { action: rec.action, suggested: rec.quantity, ordered: adj.quantity, delta_units: d.units, delta_percent: d.percent, reason: adj.reason, note: adj.note },
      skuId: rec.sku_id as string, recommendationId: id, runId: Number(rec.run_id),
    });
  } else {
    await logActivity({
      kind: "decision.approved",
      summary: rec.action === "ORDER_NOW" ? `Approved ${who} at ${(rec.quantity as number).toLocaleString("en-IN")} units, as suggested` : `Approved ${who}: ${String(rec.action).toLowerCase().replace("_", " ")}`,
      details: { action: rec.action, suggested: rec.quantity, ordered: rec.quantity },
      skuId: rec.sku_id as string, recommendationId: id, runId: Number(rec.run_id),
    });
  }
}

/**
 * Change the quantity of an APPROVED order that is not in a draft PO yet, with a reason. Once a draft PO carries the
 * line it is locked (Zoho already has the number). Setting it back to the suggestion clears the difference.
 */
export async function setApprovedQuantity(id: number, adjustment: unknown): Promise<void> {
  const p = parseAdjustment(adjustment as never);
  if (!p.ok) throw new Error(p.error);
  const adj = p.value;
  const sql = getSql();
  const [rec] = await sql`SELECT r.quantity, r.approved_quantity, r.draft_po_id, r.status, r.action, r.sku_id, r.run_id, m.sku_name FROM recommendations r
    LEFT JOIN sku_master m ON m.sku_id = r.sku_id WHERE r.id = ${id}`;
  if (!rec || rec.status !== "APPROVED" || rec.action !== "ORDER_NOW") throw new Error("Only an approved order can be changed.");
  if (rec.draft_po_id !== null) throw new Error("A draft PO was already created with this quantity, so it can no longer be changed here.");

  const current = (rec.approved_quantity ?? rec.quantity) as number;
  if (adj.quantity === current) return;
  const backToSuggestion = adj.quantity === rec.quantity;
  const rows = await sql`UPDATE recommendations SET approved_quantity = ${backToSuggestion ? null : adj.quantity},
      adjustment_reason = ${backToSuggestion ? null : adj.reason}, adjustment_note = ${backToSuggestion ? null : adj.note}
    WHERE id = ${id} AND status = 'APPROVED' AND draft_po_id IS NULL RETURNING id`;
  if (rows.length === 0) throw new Error("A draft PO was just created with this line, so it can no longer be changed.");
  await sql`INSERT INTO quantity_audit (recommendation_id, old_quantity, new_quantity, reason, note) VALUES (${id}, ${current}, ${adj.quantity}, ${adj.reason}, ${adj.note})`;

  const d = describeDelta(rec.quantity as number, adj.quantity);
  await logActivity({
    kind: "quantity.adjusted",
    summary: `Changed the quantity of ${nameOf(rec.sku_id as string, rec.sku_name as string | null)} from ${current.toLocaleString("en-IN")} to ${adj.quantity.toLocaleString("en-IN")} units (suggested ${(rec.quantity as number).toLocaleString("en-IN")}, ${sign(d.units)}, ${pct(d.percent)}). Reason: ${ADJUSTMENT_LABELS[adj.reason]}${adj.note ? ` — ${adj.note}` : ""}`,
    details: { suggested: rec.quantity, from: current, ordered: adj.quantity, delta_units: d.units, delta_percent: d.percent, reason: adj.reason, note: adj.note },
    skuId: rec.sku_id as string, recommendationId: id, runId: Number(rec.run_id),
  });
}

export async function rejectRecommendation(id: number, reason: unknown): Promise<void> {
  const parsed = parseRejectionReason(reason);
  const sql = getSql();
  const rows = await sql`UPDATE recommendations r SET status = 'REJECTED', rejection_reason = ${parsed}, decided_at = now()
    WHERE r.id = ${id} AND r.status = 'PENDING' AND r.action <> 'NEEDS_RAGHAV' RETURNING r.sku_id, r.run_id, r.action, r.quantity`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");
  const [m] = await sql`SELECT sku_name FROM sku_master WHERE sku_id = ${rows[0].sku_id}`;
  await logActivity({
    kind: "decision.rejected",
    summary: `Rejected ${nameOf(rows[0].sku_id as string, (m?.sku_name as string) ?? null)}. Reason: ${REJECTION_LABELS[parsed]}`,
    details: { action: rows[0].action, suggested: rows[0].quantity, rejection_reason: parsed },
    skuId: rows[0].sku_id as string, recommendationId: id, runId: Number(rows[0].run_id),
  });
}
