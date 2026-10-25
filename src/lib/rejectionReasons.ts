/** The three reasons Raghav can pick when rejecting. No server code here, so client components can import it. */
export const REJECTION_REASONS = ["wrong_data", "rule_doesnt_fit", "my_judgment"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  wrong_data: "The data is wrong",
  rule_doesnt_fit: "The rule doesn't fit this case",
  my_judgment: "My own judgment says otherwise",
};
