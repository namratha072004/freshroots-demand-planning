/** Simple dashboard login (D4). AUTH_MODE=open accepts any password; AUTH_MODE=password checks DASHBOARD_PASSWORD. */
export const SESSION_COOKIE = "fr_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type AuthMode = "open" | "password";

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE?.trim() === "password" ? "password" : "open";
}

/** Fails closed: in password mode with no DASHBOARD_PASSWORD set, nobody can log in. */
export function passwordAccepted(input: string): boolean {
  if (getAuthMode() === "open") return true;
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// The signing key reuses existing secrets so no extra environment variable is needed.
function signingKey(): string {
  const key = process.env.DASHBOARD_PASSWORD || process.env.DATABASE_URL;
  if (!key) throw new Error("No secret available to sign the session (set DATABASE_URL)");
  return key;
}

async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_MESSAGE = "freshroots-dashboard-session-v1";

export async function createSessionToken(): Promise<string> {
  return hmacHex(`${SESSION_MESSAGE}:${getAuthMode()}`, signingKey());
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return constantTimeEqual(token, await createSessionToken());
}
