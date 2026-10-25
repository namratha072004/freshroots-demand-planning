import { getSql } from "./db";
import { parseQuantity } from "./quantity";

import { REJECTION_LABELS, REJECTION_REASONS, type RejectionReason } from "./rejectionReasons";

export { REJECTION_LABELS, REJECTION_REASONS, type RejectionReason };

export function parseRejectionReason(value: unknown): RejectionReason {
  if (typeof value === "string" && (REJECTION_REASONS as readonly string[]).includes(value)) {
    return value as RejectionReason;
  }
  throw new Error("Pick a reason for rejecting");
}

/**
 * Approve a PENDING recommendation (not NEEDS_RAGHAV), once. For an ORDER_NOW flag the planner may approve a different
 * quantity than the rules recommended: the recommendation is kept, the planner's number is stored beside it and logged.
 */
export async function approveRecommendation(id: number, quantity?: unknown): Promise<void> {
  const sql = getSql();
  const [rec] = await sql`SELECT action, quantity FROM recommendations WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV'`;
  if (!rec) throw new Error("This flag can no longer be decided");

  let edited: number | null = null;
  if (quantity !== undefined && quantity !== null && quantity !== "") {
    if (rec.action !== "ORDER_NOW") throw new Error("Only an order has a quantity.");
    const q = parseQuantity(quantity);
    if (!q.ok) throw new Error(q.error);
    if (q.value !== rec.quantity) edited = q.value;
  }

  const rows = await sql`UPDATE recommendations SET status = 'APPROVED', decided_at = now(), approved_quantity = ${edited}
    WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV' RETURNING id`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");
  if (edited !== null) await sql`INSERT INTO quantity_audit (recommendation_id, old_quantity, new_quantity) VALUES (${id}, ${rec.quantity}, ${edited})`;
}

/**
 * Change the quantity of an APPROVED order that is not in a draft PO yet. Once a draft PO has been made the line is
 * locked (the PO in Zoho already carries the number). Setting it back to the recommendation clears the edit.
 */
export async function setApprovedQuantity(id: number, quantity: unknown): Promise<void> {
  const q = parseQuantity(quantity);
  if (!q.ok) throw new Error(q.error);
  const sql = getSql();
  const [rec] = await sql`SELECT quantity, approved_quantity, draft_po_id, status, action FROM recommendations WHERE id = ${id}`;
  if (!rec || rec.status !== "APPROVED" || rec.action !== "ORDER_NOW") throw new Error("Only an approved order can be changed.");
  if (rec.draft_po_id !== null) throw new Error("A draft PO was already created with this quantity, so it can no longer be changed here.");

  const current = (rec.approved_quantity ?? rec.quantity) as number;
  if (q.value === current) return;
  const next = q.value === rec.quantity ? null : q.value;
  const rows = await sql`UPDATE recommendations SET approved_quantity = ${next}
    WHERE id = ${id} AND status = 'APPROVED' AND draft_po_id IS NULL RETURNING id`;
  if (rows.length === 0) throw new Error("A draft PO was just created with this line, so it can no longer be changed.");
  await sql`INSERT INTO quantity_audit (recommendation_id, old_quantity, new_quantity) VALUES (${id}, ${current}, ${q.value})`;
}

export async function rejectRecommendation(id: number, reason: unknown): Promise<void> {
  const parsed = parseRejectionReason(reason);
  const sql = getSql();
  const rows = await sql`UPDATE recommendations SET status = 'REJECTED', rejection_reason = ${parsed}, decided_at = now()
    WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV' RETURNING id`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");
}
