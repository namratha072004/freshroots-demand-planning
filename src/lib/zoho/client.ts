import { config } from "@/config";

/**
 * Minimal Zoho Inventory client (India data centre). It can only: refresh a token, read items and vendors,
 * look a PO up, and CREATE a purchase order (which Zoho creates as a draft). It has no function that issues,
 * sends, submits or approves a PO, and a test keeps it that way.
 */
export class ZohoError extends Error {
  /** True when Zoho answered with an error (so nothing was created); false when we never got an answer. */
  constructor(
    message: string,
    readonly answered: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ZohoError";
  }
}

export interface ZohoEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
  accountsUrl: string;
  apiUrl: string;
}

export function zohoEnv(env: NodeJS.ProcessEnv = process.env): ZohoEnv {
  const need = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORG_ID", "ZOHO_ACCOUNTS_URL", "ZOHO_API_URL"] as const;
  const missing = need.filter((k) => !env[k]?.trim());
  if (missing.length) throw new ZohoError(`Zoho is not configured: ${missing.join(", ")} not set`, false);
  return {
    clientId: env.ZOHO_CLIENT_ID!.trim(),
    clientSecret: env.ZOHO_CLIENT_SECRET!.trim(),
    refreshToken: env.ZOHO_REFRESH_TOKEN!.trim(),
    orgId: env.ZOHO_ORG_ID!.trim(),
    accountsUrl: env.ZOHO_ACCOUNTS_URL!.trim().replace(/\/$/, ""),
    apiUrl: env.ZOHO_API_URL!.trim().replace(/\/$/, ""),
  };
}

export const isDryRun = (env: NodeJS.ProcessEnv = process.env) => env.ZOHO_DRY_RUN?.trim().toLowerCase() === "true";

export interface ZohoItem {
  item_id: string;
  sku: string;
  name: string;
  status: string;
}
export interface ZohoVendor {
  contact_id: string;
  contact_name: string;
  status: string;
}
export interface ZohoPo {
  purchaseorder_id: string;
  purchaseorder_number: string;
  status: string;
  reference_number?: string;
}
export interface PoPayload {
  vendor_id: string;
  reference_number: string;
  notes: string;
  line_items: { item_id: string; quantity: number }[];
}

export class ZohoClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(
    private readonly env: ZohoEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.env.accountsUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.env.refreshToken,
          client_id: this.env.clientId,
          client_secret: this.env.clientSecret,
        }),
        signal: AbortSignal.timeout(config.zoho.requestTimeoutMs),
      });
    } catch (e) {
      throw new ZohoError(`Could not reach Zoho to sign in: ${e instanceof Error ? e.message : String(e)}`, false);
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) throw new ZohoError(`Zoho sign-in failed${body.error ? `: ${body.error}` : ""}`, true, res.status);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async request<T>(method: "GET" | "POST", path: string, query: Record<string, string> = {}, body?: unknown, retry = true): Promise<T> {
    const url = `${this.env.apiUrl}/inventory/v1/${path}?${new URLSearchParams({ ...query, organization_id: this.env.orgId })}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Zoho-oauthtoken ${await this.accessToken()}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.zoho.requestTimeoutMs),
      });
    } catch (e) {
      if (e instanceof ZohoError) throw e;
      // No answer: for a POST we cannot know whether Zoho created anything.
      throw new ZohoError(`No answer from Zoho: ${e instanceof Error ? e.message : String(e)}`, false);
    }
    if (res.status === 401 && retry) {
      await this.accessToken(true);
      return this.request(method, path, query, body, false);
    }
    const json = (await res.json().catch(() => null)) as ({ code?: number; message?: string } & Record<string, unknown>) | null;
    if (!res.ok || !json || (typeof json.code === "number" && json.code !== 0)) {
      throw new ZohoError(`Zoho said: ${json?.message ?? `HTTP ${res.status}`}${json?.code !== undefined ? ` (code ${json.code})` : ""}`, true, res.status);
    }
    return json as T;
  }

  async listItems(): Promise<ZohoItem[]> {
    const r = await this.request<{ items?: ZohoItem[] }>("GET", "items", { per_page: "200" });
    return r.items ?? [];
  }

  async findVendorByName(name: string): Promise<ZohoVendor | null> {
    const r = await this.request<{ contacts?: ZohoVendor[] }>("GET", "contacts", { contact_type: "vendor", per_page: "200" });
    return (r.contacts ?? []).find((c) => c.contact_name.trim().toLowerCase() === name.trim().toLowerCase() && c.status === "active") ?? null;
  }

  /** Look up a PO we may already have created, by the reference number we put on it. */
  async findPoByReference(reference: string): Promise<ZohoPo | null> {
    const r = await this.request<{ purchaseorders?: ZohoPo[] }>("GET", "purchaseorders", { reference_number: reference, per_page: "200" });
    return (r.purchaseorders ?? []).find((p) => p.reference_number === reference) ?? null;
  }

  /** Creates a purchase order. Zoho creates it as a draft; the response status is stored and checked by the caller. */
  async createPurchaseOrder(payload: PoPayload): Promise<ZohoPo> {
    // Zoho's real reply names the object `purchaseorder` (its docs say `purchase_order`): accept both.
    const r = await this.request<{ purchaseorder?: ZohoPo; purchase_order?: ZohoPo }>("POST", "purchaseorders", {}, payload);
    const po = r.purchaseorder ?? r.purchase_order;
    // A success reply we cannot read means the PO probably EXISTS. Report it as "not known" so the caller checks
    // Zoho by reference number before ever creating another one. It must never look like a clean failure.
    if (!po?.purchaseorder_id) throw new ZohoError("Zoho said success but the reply had no purchase order id", false);
    return po;
  }
}
