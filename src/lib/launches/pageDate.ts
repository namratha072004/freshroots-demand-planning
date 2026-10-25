/** Reads a page's own publication date (YYYY-MM-DD) from its markup. Never from model text. */

const META_KEYS = [
  "article:published_time",
  "og:published_time",
  "og:article:published_time",
  "datepublished",
  "publishdate",
  "publish-date",
  "pubdate",
  "date",
  "dc.date",
  "dc.date.issued",
  "sailthru.date",
  "parsely-pub-date",
];

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }
  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function jsonLdDates(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === "object") {
          const rec = o as Record<string, unknown>;
          if (typeof rec.datePublished === "string") out.push(rec.datePublished);
          Object.values(rec).forEach(walk);
        }
      };
      walk(JSON.parse(m[1]));
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return out;
}

/** Candidate dates in priority order: meta tags, JSON-LD, itemprop, <time>. Returns the first valid one. */
export function extractPublishedDate(html: string): string | null {
  const head = html.slice(0, 400_000);
  const candidates: string[] = [];

  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (content && META_KEYS.includes(key)) candidates.push(content);
  }
  candidates.push(...jsonLdDates(head));
  for (const m of head.matchAll(/<[a-z]+\b[^>]*itemprop\s*=\s*["']datePublished["'][^>]*>/gi)) {
    const v = attr(m[0], "content") ?? attr(m[0], "datetime");
    if (v) candidates.push(v);
  }
  for (const m of head.matchAll(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/gi)) candidates.push(m[1]);

  for (const c of candidates) {
    const d = toIsoDate(c);
    if (d) return d;
  }
  return null;
}
