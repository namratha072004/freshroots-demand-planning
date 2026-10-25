import { z } from "zod";
import { config } from "@/config";
import type { GroundedResponse } from "../gemini";
import { candidatesFromResponse } from "./grounding";
import type { FetchedSource } from "./fetchSource";
import { extractPublishedDate } from "./pageDate";

/** Launch lead: { title, category, source_url, source_date, summary } plus the audit fields. Validated before a lead is kept. */
export const LaunchLeadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().min(1),
  source_url: z.string().url(),
  source_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().trim().min(1).max(400),
  grounding_uri: z.string().min(1),
  source_site: z.string(),
});

export interface FinalLead {
  title: string;
  category: string;
  source_url: string;
  source_date: string; // the source page's own publication date, YYYY-MM-DD
  summary: string;
  grounding_uri: string;
  source_site: string;
}

export interface LeadStats {
  /** Gemini search calls made this run, retries included. Never above maxSearchesPerRun. */
  searches: number;
  searchesFailed: number;
  /** Calls that came back with no grounding (the model answered from memory). */
  ungrounded: number;
  /** Categories that never got a grounded answer. */
  categoriesWithoutGrounding: string[];
  candidates: number;
  kept: number;
  dropped: { noGroundedSource: number; sourceUnreadable: number; noPageDate: number; tooOld: number; forbiddenText: number; duplicate: number; invalidShape: number };
  errors: string[];
}

export interface LeadDeps {
  search: (prompt: string, timeoutMs: number) => Promise<GroundedResponse>;
  fetchSource: (groundingUri: string) => Promise<FetchedSource | null>;
  /** The real clock. Never ASOF_OVERRIDE. */
  now: Date;
}

/** Leads are unverified references: no demand estimates and no advice to stock. */
const FORBIDDEN = /\b(should|must|need to|recommend\w*|advis\w*|suggest\w*)\b[^.]{0,40}\b(stock|buy|order|list|carry|sell|launch)\b|\bdemand\b|\bforecast\w*|\bwill (sell|boom|grow|be popular)\b|\bbest[- ]seller\b|\bfreshroots\b/i;
const MODEL_DATE = /\b(19|20)\d{2}\b|\b(January|February|March|April|June|July|August|September|October|November|December)\b/i;

export function searchPrompt(category: string, today: string, cutoff: string): string {
  // A plain question with a light list format. Asking for strict JSON made the model skip the search most of the time.
  return `What new "${category}" products have been launched in the Indian packaged food and beverage market since ${cutoff}? Today is ${today}. Give a numbered list of up to ${config.launches.maxLeadsPerSearch}. For each, write the brand and product name in bold, then a colon, then one neutral factual sentence about the launch. Do not mention dates, months or years. Do not estimate demand or sales, do not forecast, and do not say or imply that anyone should stock, buy, sell or list it.`;
}

/** Lower-case letters and digits only, so "SIX6R Sparkling Water" and "Six6R sparkling water!" match. */
export const normalizeTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Searches each category and keeps only leads that have a grounded source whose own page carries a
 * publication date inside the allowed window. Everything else is dropped and counted. Never throws.
 */
export async function collectLeads(
  categories: string[],
  deps: LeadDeps,
  deadline: number,
  attempts: number = config.launches.attemptsPerCategory,
  limits: { maxAgeDays: number; maxSearchesPerRun: number } = config.launches,
): Promise<{ leads: FinalLead[]; stats: LeadStats }> {
  const { searchTimeoutMs, searchPhaseMs, pageFetchPhaseMs } = config.launches;
  const { maxAgeDays } = limits;
  const started = Date.now();
  const searchDeadline = Math.min(deadline, started + searchPhaseMs);
  const stats: LeadStats = {
    searches: 0,
    searchesFailed: 0,
    ungrounded: 0,
    categoriesWithoutGrounding: [],
    candidates: 0,
    kept: 0,
    dropped: { noGroundedSource: 0, sourceUnreadable: 0, noPageDate: 0, tooOld: 0, forbiddenText: 0, duplicate: 0, invalidShape: 0 },
    errors: [],
  };
  // Whole-day comparison: a page dated exactly maxAgeDays ago is still in range.
  const cutoff = isoDay(new Date(deps.now.getTime() - maxAgeDays * 86_400_000));
  const latest = isoDay(new Date(deps.now.getTime() + 86_400_000));
  const today = isoDay(deps.now);

  // At most a few page loads at once: dozens in parallel overwhelm a slow connection and time out.
  const waiting: (() => void)[] = [];
  let active = 0;
  const limited = async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= config.launches.maxParallelPageFetches) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };

  // One shared page cache so two leads citing the same article cost one fetch.
  const pages = new Map<string, Promise<{ url: string; date: string | null } | null>>();
  const page = (uri: string) => {
    if (!pages.has(uri)) {
      pages.set(
        uri,
        limited(() => deps.fetchSource(uri))
          .then((p) => (p ? { url: p.url, date: extractPublishedDate(p.html) } : null))
          .catch(() => null),
      );
    }
    return pages.get(uri)!;
  };

  // Google's grounding links are short-lived, so each answer's source pages are read the moment the answer
  // arrives, not after the slowest search finishes.
  const prefetch = (res: GroundedResponse) => {
    for (const c of candidatesFromResponse(res).slice(0, config.launches.maxLeadsPerSearch)) {
      if (FORBIDDEN.test(`${c.title} ${c.summary}`) || MODEL_DATE.test(c.summary)) continue;
      for (const chunk of c.chunks.slice(0, 3)) void page(chunk.uri);
    }
  };

  // Searching: one call per category, then retry categories that came back without sources while the cap and
  // time allow. Every call counts toward the cap. Only answers that came back with sources are used.
  const answers: { category: string; res: GroundedResponse }[] = [];
  const tries = new Map<string, number>();
  let pending = [...categories];
  let callsLeft = limits.maxSearchesPerRun;
  while (pending.length > 0 && callsLeft > 0 && searchDeadline - Date.now() > (tries.size === 0 ? 1_000 : 12_000)) {
    const round = pending.slice(0, callsLeft);
    callsLeft -= round.length;
    stats.searches += round.length;
    const failedToGround: string[] = [];
    await Promise.all(
      round.map(async (category) => {
        tries.set(category, (tries.get(category) ?? 0) + 1);
        try {
          const res = await deps.search(searchPrompt(category, today, cutoff), Math.max(1_000, Math.min(searchTimeoutMs, searchDeadline - Date.now())));
          if (res.chunks.length > 0 && res.supports.length > 0) {
            answers.push({ category, res });
            prefetch(res);
          } else {
            stats.ungrounded++;
            if ((tries.get(category) ?? 0) < attempts) failedToGround.push(category);
          }
        } catch (e) {
          stats.searchesFailed++;
          stats.errors.push(`${category}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
        }
      }),
    );
    pending = [...failedToGround, ...pending.slice(round.length)];
  }
  // Page reading gets its own budget, counted from when the searches finish.
  const fetchDeadline = Math.min(deadline, Date.now() + pageFetchPhaseMs);
  const grounded = new Set(answers.map((a) => a.category));
  stats.categoriesWithoutGrounding = categories.filter((c) => !grounded.has(c));

  const perCategory = await Promise.all(
    answers.map(async ({ category, res }) => {
      const kept: FinalLead[] = [];
      for (const c of candidatesFromResponse(res).slice(0, config.launches.maxLeadsPerSearch)) {
        stats.candidates++;
        if (FORBIDDEN.test(`${c.title} ${c.summary}`) || MODEL_DATE.test(c.summary)) {
          stats.dropped.forbiddenText++;
          continue;
        }
        if (c.chunks.length === 0) {
          stats.dropped.noGroundedSource++;
          continue;
        }
        if (Date.now() > fetchDeadline) {
          stats.dropped.sourceUnreadable++;
          continue;
        }
        let reason: "sourceUnreadable" | "noPageDate" | "tooOld" = "sourceUnreadable";
        let found: FinalLead | null = null;
        for (const chunk of c.chunks.slice(0, 3)) {
          const p = await Promise.race([page(chunk.uri), new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, fetchDeadline - Date.now())))]);
          if (!p) continue;
          if (!p.date) {
            reason = reason === "sourceUnreadable" ? "noPageDate" : reason;
            continue;
          }
          if (p.date < cutoff || p.date > latest) {
            reason = "tooOld";
            continue;
          }
          found = {
            title: c.title,
            category,
            source_url: p.url,
            source_date: p.date,
            summary: c.summary,
            grounding_uri: chunk.uri,
            source_site: chunk.title,
          };
          break;
        }
        if (found && !LaunchLeadSchema.safeParse(found).success) stats.dropped.invalidShape++;
        else if (found) kept.push(found);
        else stats.dropped[reason]++;
      }
      return kept;
    }),
  );

  // The same story often arrives through several articles: keep one lead per source URL and per category + title.
  const seen = new Set<string>();
  const leads: FinalLead[] = [];
  for (const l of perCategory.flat()) {
    const key = l.source_url.toLowerCase();
    const titleKey = `${l.category}|${normalizeTitle(l.title)}`;
    if (seen.has(key) || seen.has(titleKey)) {
      stats.dropped.duplicate++;
      continue;
    }
    seen.add(key);
    seen.add(titleKey);
    leads.push(l);
  }
  stats.kept = leads.length;
  return { leads, stats };
}
