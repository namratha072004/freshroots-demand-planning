import { config } from "@/config";

const MAX_HOPS = 6;
const MAX_BYTES = 400_000;

/** Block obviously internal hosts before following any hop. */
export function isSafePublicUrl(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  if (h.startsWith("[") || h.includes(":")) return false; // IPv6 literals
  return true;
}

export interface FetchedSource {
  url: string;
  html: string;
}

/**
 * Follow a Google grounding link to the publisher page and return the page's final URL and HTML.
 * The first hop must be Google's grounding redirect; every later hop must be a public http(s) URL.
 */
export async function fetchSource(groundingUri: string, fetchImpl: typeof fetch = fetch): Promise<FetchedSource | null> {
  let current: URL;
  try {
    current = new URL(groundingUri);
  } catch {
    return null;
  }
  if (current.hostname !== "vertexaisearch.cloud.google.com" || !current.pathname.startsWith("/grounding-api-redirect/")) return null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetchImpl(current, {
      redirect: "manual",
      headers: { "User-Agent": "FreshrootsPlanningBot/1.0 (reads page publication dates)", Accept: "text/html" },
      signal: AbortSignal.timeout(config.launches.pageFetchTimeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      const next = new URL(loc, current);
      if (!isSafePublicUrl(next)) return null;
      current = next;
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) return null;
    const reader = res.body?.getReader();
    if (!reader) return { url: current.toString(), html: await res.text() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return { url: current.toString(), html: Buffer.concat(chunks).toString("utf8") };
  }
  return null;
}
