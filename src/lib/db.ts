import { neon, neonConfig } from "@neondatabase/serverless";

/** Every database request gets its own limit, so a stalled connection fails fast instead of hanging for minutes. */
export const DB_REQUEST_TIMEOUT_MS = 30_000;

neonConfig.fetchFunction = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS) });

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
