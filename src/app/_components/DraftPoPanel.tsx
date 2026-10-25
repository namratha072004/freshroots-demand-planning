import { ExternalLink, FileCheck2 } from "lucide-react";
import { config } from "@/config";
import { isDryRun } from "@/lib/zoho/client";
import { getPendingAttempt, getReadyBatch, listDraftPos } from "@/lib/zoho/draftPo";
import { CreatePoButton } from "./CreatePoButton";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** Draft purchase order: the lines ready to go, the button, and the POs already created in Zoho. */
export async function DraftPoPanel({ stopped }: { stopped: boolean }) {
  const [batch, pos, pending] = await Promise.all([getReadyBatch(), listDraftPos(), getPendingAttempt()]);
  const org = process.env.ZOHO_ORG_ID?.trim();
  const dry = isDryRun();
  return (
    <section className="card po section" style={{ marginTop: 0 }} aria-label="Draft purchase order">
      <div className="po-head">
        <FileCheck2 size={18} />
        <h2>Draft purchase order</h2>
        {dry && <span className="chip warn">Dry run: nothing is created in Zoho</span>}
      </div>

      {pending ? (
        <>
          <div className="error" style={{ marginTop: 10 }}>
            An earlier draft PO ({pending.referenceNumber}: {pending.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}) did not finish, and it is not known whether Zoho created it.
          </div>
          <div className="muted" style={{ fontSize: 13.5 }}>The button checks Zoho first and creates the PO only if Zoho does not already have it, so it can never be created twice.</div>
          <CreatePoButton lineCount={pending.lines.length} blocked={stopped} dryRun={dry} recheck />
        </>
      ) : batch ? (
        <>
          <div className="po-lines" aria-label="Lines ready">
            {batch.lines.map((l) => (
              <span key={l.skuId} className="po-line"><b>{l.skuId}</b> × {l.quantity}</span>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            One draft PO in Zoho Inventory under &ldquo;{config.zoho.defaultVendorName}&rdquo;. SKU and quantity only, no price. It stays a draft until procurement adds the price and places the order in Zoho.
          </div>
          <CreatePoButton lineCount={batch.lines.length} blocked={stopped} dryRun={dry} />
        </>
      ) : (
        <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>No approved ORDER_NOW lines are waiting. Approve flags below, then create the draft PO here.</div>
      )}

      {pos.length > 0 && (
        <div className="po-history">
          {pos.map((p) => (
            <div key={p.id} className="po-row">
              <div>
                <strong>{p.zohoPoNumber ?? p.referenceNumber}</strong>
                <div className="muted" style={{ fontSize: 12.5 }}>{when(p.createdAt)} IST</div>
              </div>
              <div>
                {p.lines.map((l) => `${l.skuId} × ${l.quantity}`).join(", ")}
                {p.zohoPoId && <div className="muted" style={{ fontSize: 12.5 }}>Zoho PO id {p.zohoPoId}</div>}
                {p.error && <div className="error">{p.error}</div>}
              </div>
              <span className={`chip ${p.status === "created" && !p.error ? "ok" : p.status === "failed" ? "bad" : "warn"}`}>
                {p.status === "created" ? `Zoho: ${p.zohoStatus ?? "?"}` : p.status === "unknown" ? "Needs a re-check" : p.status}
              </span>
              {p.zohoPoId && org ? (
                <a href={`https://inventory.zoho.in/app/${org}#/purchaseorders/${p.zohoPoId}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  Open in Zoho <ExternalLink size={14} />
                </a>
              ) : <span />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
