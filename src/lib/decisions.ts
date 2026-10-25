import { getSql } from "./db";

export const REJECTION_REASONS = ["wrong_data", "rule_doesnt_fit", "my_judgment"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  wrong_data: "The data is wrong",
  rule_doesnt_fit: "The rule doesn't fit this case",
  my_judgment: "My own judgment says otherwise",
};

export function parseRejectionReason(value: unknown): RejectionReason {
  if (typeof value === "string" && (REJECTION_REASONS as readonly string[]).includes(value)) {
    return value as RejectionReason;
  }
  throw new Error("Pick a reason for rejecting");
}

// Only PENDING recommendations the system actually recommended (not NEEDS_RAGHAV) can be decided, once.
export async function approveRecommendation(id: number): Promise<void> {
  const sql = getSql();
  const rows = await sql`UPDATE recommendations SET status = 'APPROVED', decided_at = now()
    WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV' RETURNING id`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");
}

export async function rejectRecommendation(id: number, reason: unknown): Promise<void> {
  const parsed = parseRejectionReason(reason);
  const sql = getSql();
  const rows = await sql`UPDATE recommendations SET status = 'REJECTED', rejection_reason = ${parsed}, decided_at = now()
    WHERE id = ${id} AND status = 'PENDING' AND action <> 'NEEDS_RAGHAV' RETURNING id`;
  if (rows.length === 0) throw new Error("This flag can no longer be decided");
}
