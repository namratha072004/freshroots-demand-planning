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
