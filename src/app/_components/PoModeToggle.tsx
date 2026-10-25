"use client";

import { FlaskConical, Loader2, Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { setPoModeAction } from "../actions";

/** Live / dry run switch for the Create draft PO button. Going live asks first. */
export function PoModeToggle({ dryRun }: { dryRun: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = (dry: boolean) =>
    start(async () => {
      const r = await setPoModeAction(dry);
      setConfirming(false);
      setMsg(r.message);
    });

  return (
    <div>
      <div className="seg" role="radiogroup" aria-label="Purchase order mode">
        <button role="radio" aria-checked={!dryRun} className={!dryRun ? "on" : ""} disabled={pending} onClick={() => (dryRun ? setConfirming(true) : undefined)}>
          <Rocket size={16} /> Live
        </button>
        <button role="radio" aria-checked={dryRun} className={dryRun ? "on" : ""} disabled={pending} onClick={() => (!dryRun ? apply(true) : undefined)}>
          <FlaskConical size={16} /> Dry run
        </button>
        {pending && <Loader2 size={16} className="spin" style={{ alignSelf: "center", marginLeft: 8 }} />}
      </div>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
        {dryRun
          ? "Dry run: the Create draft PO button only shows the request that would be sent. Nothing is created in Zoho."
          : "Live: the Create draft PO button creates a real draft purchase order in Zoho Inventory (draft only, no price, never sent)."}
      </p>
      {confirming && (
        <div className="banner alert" style={{ marginTop: 12 }}>
          <div className="banner-body">
            <strong>Switch to live?</strong> Pressing Create draft PO will then add a real draft to your Zoho. You can switch back at any time.
            <div className="rejectbox">
              <button className="primary" disabled={pending} onClick={() => apply(false)}>Yes, go live</button>
              <button disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {msg && <div className="form-ok" role="status" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
