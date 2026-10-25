import { config } from "@/config";
import { getPendingAttempt, getReadyBatch, listDraftPos } from "@/lib/zoho/draftPo";
import { isDryRun } from "@/lib/zoho/client";
import { CreatePoButton } from "./CreatePoButton";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** Draft purchase orders: the lines ready to go, the button, and the POs already created in Zoho. */
export async function DraftPoPanel({ stopped }: { stopped: boolean }) {
  const [batch, pos, pending] = await Promise.all([getReadyBatch(), listDraftPos(), getPendingAttempt()]);
  const org = process.env.ZOHO_ORG_ID?.trim();
  const dry = isDryRun();
  return (
    <div className="card">
      <div className="bar" style={{ marginBottom: 8 }}>
        <strong>Draft purchase order</strong>
        {dry && <span className="badge warn">Dry run: nothing will be created in Zoho</span>}
      </div>
      {pending ? (
        <>
          <div className="error">
            An earlier draft PO ({pending.referenceNumber}: {pending.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}) did not finish and it is not known whether Zoho
            created it.
          </div>
          <div className="meta">Pressing the button checks Zoho first. It creates the PO only if Zoho does not already have it, so it can never be created twice.</div>
          <CreatePoButton lineCount={pending.lines.length} blocked={stopped} dryRun={dry} recheck />
        </>
      ) : batch ? (
        <>
          <div>
            {batch.lines.length} approved ORDER_NOW {batch.lines.length === 1 ? "line is" : "lines are"} ready:{" "}
            {batch.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}
          </div>
          <div className="meta">
            One draft PO in Zoho Inventory under &ldquo;{config.zoho.defaultVendorName}&rdquo;. SKU and quantity only, no price. It stays a
            draft until procurement adds the price and places the order in Zoho.
          </div>
          <CreatePoButton lineCount={batch.lines.length} blocked={stopped} dryRun={dry} />
        </>
      ) : (
        <div className="meta">No approved ORDER_NOW lines are waiting. Approve flags above, then create the draft PO here.</div>
      )}
      {pos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="meta" style={{ marginBottom: 4 }}>
            Draft POs created
          </div>
          {pos.map((p) => (
            <div key={p.id} className="row po">
              <div>
                <strong>{p.zohoPoNumber ?? p.referenceNumber}</strong>
                <div className="meta">{when(p.createdAt)} IST</div>
              </div>
              <div>
                {p.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}
                {p.zohoPoId && <div className="meta">Zoho PO id {p.zohoPoId}</div>}
                {p.error && <div className="error">{p.error}</div>}
              </div>
              <div>
                <span className={`badge ${p.status === "created" && !p.error ? "ok" : p.status === "failed" ? "bad" : "warn"}`}>
                  {p.status === "created" ? `Zoho status: ${p.zohoStatus ?? "?"}` : p.status === "unknown" ? "Needs a re-check" : p.status}
                </span>
              </div>
              <div>
                {p.zohoPoId && org && (
                  <a href={`https://inventory.zoho.in/app/${org}#/purchaseorders/${p.zohoPoId}`} target="_blank" rel="noopener noreferrer">
                    Open in Zoho
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
