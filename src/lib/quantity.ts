import { ADJUSTMENT_REASONS, MAX_NOTE_LENGTH, type AdjustmentReason } from "./adjustmentReasons";

/** Planner-edited order quantities: what is allowed, and when to ask twice. Pure, so it is shared by the page and the server. */
export const MIN_QTY = 1;
export const MAX_QTY = 1_000_000;
/** An edit above this multiple of the recommendation asks for a second confirmation. */
export const CONFIRM_ABOVE_MULTIPLE = 2;

export type QuantityCheck = { ok: true; value: number } | { ok: false; error: string };

/** Accepts a whole number from 1 to 1,000,000 (typed text or a number). */
export function parseQuantity(input: unknown): QuantityCheck {
  const raw = typeof input === "string" ? input.trim().replace(/,/g, "") : input;
  if (raw === "" || raw === null || raw === undefined) return { ok: false, error: "Enter a quantity." };
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: "Enter a number." };
  if (!Number.isInteger(n)) return { ok: false, error: "Use a whole number of units." };
  if (n < MIN_QTY) return { ok: false, error: "Use at least 1 unit. To order nothing, reject the flag instead." };
  if (n > MAX_QTY) return { ok: false, error: `That is more than ${MAX_QTY.toLocaleString("en-IN")} units.` };
  return { ok: true, value: n };
}

/** True when the planner is ordering a lot more than the rules recommended. */
export function needsHighConfirm(quantity: number, recommended: number | null): boolean {
  return recommended !== null && recommended > 0 && quantity > recommended * CONFIRM_ABOVE_MULTIPLE;
}

/** The difference between what the rules suggested and what the planner chose. Negative = ordering less. */
export function describeDelta(suggested: number, chosen: number): { units: number; percent: number } {
  const units = chosen - suggested;
  return { units, percent: suggested > 0 ? Math.round((units / suggested) * 1000) / 10 : 0 };
}

export interface Adjustment {
  quantity: number;
  reason: AdjustmentReason;
  note: string | null;
}

export type AdjustmentCheck = { ok: true; value: Adjustment } | { ok: false; error: string };

/** A quantity change must come with a reason (picked from the list) and may carry a short note. */
export function parseAdjustment(input: { quantity?: unknown; reason?: unknown; note?: unknown } | null | undefined): AdjustmentCheck {
  const q = parseQuantity(input?.quantity);
  if (!q.ok) return q;
  const reason = input?.reason;
  if (typeof reason !== "string" || !(ADJUSTMENT_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: "Pick a reason for the change, so the difference from the rules can be understood later." };
  }
  const rawNote = typeof input?.note === "string" ? input.note.trim() : "";
  if (rawNote.length > MAX_NOTE_LENGTH) return { ok: false, error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` };
  return { ok: true, value: { quantity: q.value, reason: reason as AdjustmentReason, note: rawNote === "" ? null : rawNote } };
}
