import { describe, expect, it } from "vitest";
import { zohoOrgUrl, zohoPoUrl } from "../src/lib/zoho/links";

describe("zoho links", () => {
  it("builds the organisation and purchase order addresses", () => {
    const org = zohoOrgUrl({ ZOHO_ORG_ID: " 123 " } as unknown as NodeJS.ProcessEnv);
    expect(org).toBe("https://inventory.zoho.in/app/123");
    expect(zohoPoUrl(org, "999")).toBe("https://inventory.zoho.in/app/123#/purchaseorders/999");
  });
  it("gives no link when something is missing", () => {
    expect(zohoOrgUrl({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(zohoPoUrl(null, "999")).toBeNull();
    expect(zohoPoUrl("https://inventory.zoho.in/app/123", null)).toBeNull();
  });
});
