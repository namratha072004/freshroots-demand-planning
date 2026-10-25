"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { ADJUSTMENT_LABELS, ADJUSTMENT_REASONS, MAX_NOTE_LENGTH } from "@/lib/adjustmentReasons";
import { needsHighConfirm, parseQuantity } from "@/lib/quantity";
import { approve, setQuantityAction } from "../actions";
import { DeltaChip } from "./DeltaChip";

/**
 * Edit the quantity. The system's suggestion is shown unchanged; the planner types their own number and picks a reason,
 * and the difference is shown live. The order uses the planner's number; both numbers are kept in the log.
 * pending: "Approve at this quantity". approved (no draft PO yet): "Save change".
 */
export function QuantityEditor({ id, status, suggested, current, initialReason, onClose }: { id: number; status: "PENDING" | "APPROVED"; suggested: number; current: number; initialReason: string | null; onClose: () => void }) {
  const [qty, setQty] = useState(String(current));
  const [reason, setReason] = useState(initialReason ?? "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmHigh, setConfirmHigh] = useState(false);

  const q = parseQuantity(qty);
  const same = q.ok && q.value === suggested;
  const unchanged = q.ok && q.value === current && status === "APPROVED";
  const reasonNeeded = status === "APPROVED" || !same; // approving at the suggestion needs no reason
  const ready = q.ok && !unchanged && (!reasonNeeded || reason !== "");

  const submit = () => {
    if (!q.ok) return;
    if (!confirmHigh && needsHighConfirm(q.value, suggested)) return setConfirmHigh(true);
    setError(null);
    start(async () => {
      const payload = { quantity: q.value, reason: reason || "my_judgment", note: note.trim() || undefined };
      const r = status === "PENDING" ? await approve(id, same ? undefined : payload) : await setQuantityAction(id, payload);
      if (!r.ok) setError(r.message);
      else onClose();
    });
  };

  return (
    <div className="qedit" role="group" aria-label="Edit the order quantity">
      <div className="qedit-grid">
        <div className="qedit-col">
          <div className="viz-label">System suggested</div>
          <div className="qedit-fixed">{suggested.toLocaleString("en-IN")} <small>units</small></div>
        </div>
        <div className="qedit-col">
          <label className="viz-label" htmlFor={`q-${id}`}>Your quantity</label>
          <div className="qedit-input">
            <input id={`q-${id}`} type="number" inputMode="numeric" min={1} step={1} value={qty} autoFocus onChange={(e) => (setQty(e.target.value), setConfirmHigh(false))} />
            {q.ok && <DeltaChip suggested={suggested} chosen={q.value} />}
          </div>
          {!q.ok && <div className="error">{q.error}</div>}
        </div>
        <div className="qedit-col qedit-reason">
          <label className="viz-label" htmlFor={`r-${id}`}>Why? {reasonNeeded ? "(required)" : ""}</label>
          <select id={`r-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!reasonNeeded}>
            <option value="">{reasonNeeded ? "Pick a reason…" : "Not needed: same as suggested"}</option>
            {ADJUSTMENT_REASONS.map((r) => <option key={r} value={r}>{ADJUSTMENT_LABELS[r]}</option>)}
          </select>
          <input type="text" placeholder="Short note (optional)" maxLength={MAX_NOTE_LENGTH} value={note} onChange={(e) => setNote(e.target.value)} disabled={!reasonNeeded} aria-label="Note" />
        </div>
      </div>
      {confirmHigh && q.ok && (
        <div className="banner alert" style={{ margin: "10px 0 0" }}>
          <div className="banner-body">{q.value.toLocaleString("en-IN")} is more than twice the suggested {suggested.toLocaleString("en-IN")}. Use it anyway? Press the button again to confirm.</div>
        </div>
      )}
      <div className="qedit-foot">
        <button className="primary" disabled={pending || !ready} onClick={submit}>
          {pending ? <Loader2 size={16} className="spin" /> : <Check size={16} strokeWidth={2.6} />}
          {status === "PENDING" ? (same ? "Approve as suggested" : `Approve ${q.ok ? q.value.toLocaleString("en-IN") : ""}`) : "Save change"}
        </button>
        <button disabled={pending} onClick={onClose}><X size={15} /> Cancel</button>
        <span className="muted" style={{ fontSize: 12.5 }}>The order uses your number. Both numbers and your reason are logged.</span>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
