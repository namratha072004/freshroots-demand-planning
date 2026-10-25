"use client";

import { useState, useTransition } from "react";
import { createDraftPoAction } from "../actions";

export function CreatePoButton({ lineCount, blocked, dryRun, recheck = false }: { lineCount: number; blocked: boolean; dryRun: boolean; recheck?: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const go = () =>
    start(async () => {
      setMsg(null);
      const r = await createDraftPoAction();
      setConfirming(false);
      if (!r.ok) setMsg({ text: r.message, error: true });
      else if (r.mode === "dry_run") setMsg({ text: `Dry run: would create 1 draft PO with ${r.lines.length} lines. Nothing was sent to Zoho.\n${JSON.stringify(r.payload, null, 2)}`, error: false });
      else if (r.mode === "already_created") setMsg({ text: `This batch already has a draft PO (${r.po.zohoPoNumber}). No second one was created.`, error: false });
      else setMsg({ text: `Draft PO ${r.po.zohoPoNumber} created in Zoho (id ${r.po.zohoPoId}, status ${r.po.zohoStatus}).${r.warning ? " " + r.warning : ""}`, error: !!r.warning });
    });

  return (
    <div style={{ marginTop: 10 }}>
      <button className="primary" disabled={pending || blocked} title={blocked ? "Blocked by the kill switch" : undefined} onClick={() => setConfirming(true)}>
        {pending ? "Working…" : recheck ? "Check Zoho and finish" : "Create draft PO"}
      </button>
      {blocked && <span className="meta"> Blocked: the kill switch is stopped.</span>}
      {confirming && (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>{dryRun ? "Dry run." : "Create a real draft purchase order in Zoho?"}</strong>{" "}
          {dryRun
            ? "Nothing will be created in Zoho. You will see the request that would be sent."
            : `It will contain ${lineCount} ${lineCount === 1 ? "line" : "lines"} with SKU and quantity, no price, and stays a draft. It is never sent or issued by this tool.`}
          <div className="rejectbox">
            <button className="primary" disabled={pending} onClick={go}>
              {dryRun ? "Run dry run" : "Yes, create the draft"}
            </button>
            <button disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <pre className={msg.error ? "error" : "meta"} style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{msg.text}</pre>}
    </div>
  );
}
