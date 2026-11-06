import { getZohoDryRun } from "@/lib/settings";
import { getPendingAttempt, getReadyBatch } from "@/lib/zoho/draftPo";
import { zohoOrgUrl } from "@/lib/zoho/links";
import { PoBar } from "./PoBar";

/** Fetches what is ready for a draft PO and hands it to the bar. Shown on the pages where orders are approved. */
export async function PoActionBar({ stopped }: { stopped: boolean }) {
  const [batch, attempt, dryRun] = await Promise.all([getReadyBatch(), getPendingAttempt(), getZohoDryRun()]);
  return (
    <PoBar
      lines={batch ? batch.lines.map((l) => ({ skuId: l.skuId, quantity: l.quantity })) : []}
      stopped={stopped}
      dryRun={dryRun}
      recheck={!!attempt}
      orgUrl={zohoOrgUrl()}
    />
  );
}
