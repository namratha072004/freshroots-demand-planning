/**
 * Single config file for every threshold and provisional rule decision.
 * Items marked "A#" are provisional defaults to confirm with Raghav (see README).
 */
export const config = {
  rules: {
    /** A1: "average weekly sales" = mean of the latest 12 weeks (which include the latest 4). */
    avgWindowWeeks: 12,
    /** Rule 1: the recent window compared against the 12-week average. */
    recentWindowWeeks: 4,
    /** Rule 1: HIGH_DEMAND when last-4-week average is MORE than 20% above the 12-week average. */
    highDemandThreshold: 0.2,
    /** Rule 1: reorder quantity multiplier when HIGH_DEMAND fires. */
    highDemandQtyMultiplier: 1.5,
    /** Rule 4 / A2: uplift applied to the 12-week average (weeks-of-cover denominator only) in festival months. */
    festivalUplift: 0.25,
    /** Rules 2-3: weeks-of-cover limits for normal SKUs. Stockout below min, overstock above max. */
    cover: { min: 6, max: 14 },
    /** Rule 5: tighter weeks-of-cover limits for High-perishability SKUs (replace the normal limits). */
    coverPerishable: { min: 3, max: 4 },
    /**
     * A3 (behaviour, implemented in src/lib/rules.ts): when several flags fire, ORDER_NOW wins over PAUSE_ORDER. If
     * HIGH_DEMAND also fires, the quantity is highDemandQtyMultiplier x the standard quantity. HIGH_DEMAND with healthy
     * stock is an order flagged for review. HIGH_DEMAND together with OVERSTOCK_RISK is NEEDS_RAGHAV.
     */
    /** A4: a SKU with fewer weeks of sales history than this is NEEDS_RAGHAV (so is missing inventory or master data). */
    minHistoryWeeks: 12,
    /** A5: exactly on a threshold is NOT flagged. Comparisons use this tolerance against float noise. */
    epsilon: 1e-9,
    /** Quantities are whole units; fractional results are rounded up. */
    roundQtyUp: true,
  },
  data: {
    /** Stale-data check: inventory As_Of_Date, or the end of the latest sales week, more than this many days before "today" (ASOF_OVERRIDE). Exactly on the limit is not stale. */
    staleDays: 7,
  },
  killSwitch: {
    /** Alert when rejection rate >= this. */
    alertRate: 0.1,
    /** Stop when rejection rate >= this. */
    stopRate: 0.25,
    /** Rolling window, in weeks. */
    windowWeeks: 4,
    /**
     * MIN_DECISIONS: below this many decided (approved + rejected) recommendations in the window the status is
     * "collecting data". The rate and the alert still show, but the stop never fires.
     * Lower this number for a demo (e.g. 4); restore to 20 afterwards.
     */
    minDecisions: 20,
  },
  ai: {
    /**
     * Gemini thinking level for reasons and triage. "low" keeps the step fast (about 3x quicker than the default on
     * this task). Set to null if GEMINI_MODEL is a model that does not support thinking levels.
     */
    thinkingLevel: "low" as "low" | "medium" | "high" | null,
  },
  zoho: {
    /** D3: one draft PO per batch of approved ORDER_NOW lines, all under this one default vendor (looked up by name). */
    defaultVendorName: "Freshroots Default Vendor",
    /** Per request time limit for Zoho calls (ms). */
    requestTimeoutMs: 30_000,
    /** Printed on every draft PO so procurement knows where it came from. */
    poNote: "DRAFT created by the Freshroots demand planning tool from lines approved by the demand planner. Price and supplier to be completed by procurement.",
  },
  ui: {
    /** The name shown in the activity log for actions taken on the dashboard. The dashboard has one login, so every dashboard action is attributed to this name. */
    plannerName: "Raghav",
  },
  launches: {
    /**
     * Hard cap on Gemini search calls per run, every call counted. A run makes one call per category, and retries a
     * category only when the answer came back without sources (the model answered from memory), up to this cap.
     */
    maxSearchesPerRun: 10,
    /** Max tries per category (the first call plus retries). */
    attemptsPerCategory: 2,
    /** Thinking level for search calls. null = model default: "low" made the model skip the search. */
    searchThinkingLevel: null as "low" | "medium" | "high" | null,
    /** A lead is dropped when the source page's own publication date is older than this many days. */
    maxAgeDays: 180,
    /** Max leads kept per category search. */
    maxLeadsPerSearch: 3,
    /**
     * Time limits (ms). Real grounded searches take about 20-40 s each, and up to ~100 s for a slow category, so
     * the search phase and the page-reading phase get separate budgets; reading pages is never starved by slow
     * searches. Vercel allows 300 s per function (Fluid compute, Hobby and Pro), and the dashboard sets 180 s.
     */
    searchTimeoutMs: 75_000,
    searchPhaseMs: 80_000,
    pageFetchTimeoutMs: 6_000,
    pageFetchPhaseMs: 20_000,
    /** Source pages loaded at the same time. */
    maxParallelPageFetches: 6,
  },
} as const;
