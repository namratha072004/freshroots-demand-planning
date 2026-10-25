import { z } from "zod";

/** Reason: { sku_id, reason } */
export const ReasonSchema = z.object({
  sku_id: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});
/** Triage: { sku_id, needs_raghav, reason } */
export const TriageSchema = z.object({
  sku_id: z.string().min(1),
  needs_raghav: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});
export type Reason = z.infer<typeof ReasonSchema>;
export type Triage = z.infer<typeof TriageSchema>;

export const REASONS_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { sku_id: { type: "string" }, reason: { type: "string" } },
    required: ["sku_id", "reason"],
    additionalProperties: false,
  },
};
export const TRIAGE_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { sku_id: { type: "string" }, needs_raghav: { type: "boolean" }, reason: { type: "string" } },
    required: ["sku_id", "needs_raghav", "reason"],
    additionalProperties: false,
  },
};
