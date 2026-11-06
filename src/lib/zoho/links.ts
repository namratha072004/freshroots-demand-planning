/** Zoho Inventory (India) web address of the organisation, or null when the organisation id is not set. */
export function zohoOrgUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const org = env.ZOHO_ORG_ID?.trim();
  return org ? `https://inventory.zoho.in/app/${org}` : null;
}

/** Page of one purchase order in Zoho, where the draft can be opened and priced. */
export function zohoPoUrl(orgUrl: string | null, poId: string | null): string | null {
  return orgUrl && poId ? `${orgUrl}#/purchaseorders/${poId}` : null;
}
