"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { needsHighConfirm, parseQuantity } from "@/lib/quantity";
import { approve, reject } from "../actions";

export interface ReasonOption {
  value: string;
  label: string;
}

/** Approve or reject. For an order, `order` carries the quantity currently typed in the row and what the rules recommended. */
export function DecisionButtons({ id, reasons, order }: { id: number; reasons: ReasonOption[]; order?: { text: string; recommended: number | null } }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmHigh, setConfirmHigh] = useState(false);

  const q = order ? parseQuantity(order.text) : null;
  const invalid = q !== null && !q.ok;

  function submit(fn: () => ReturnType<typeof approve>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      setConfirmHigh(false);
    });
  }

  function onApprove() {
    if (q && q.ok && order && needsHighConfirm(q.value, order.recommended)) {
      setConfirmHigh(true);
      return;
    }
    submit(() => approve(id, q && q.ok ? q.value : undefined));
  }

  return (
    <div>
      <div className="actions">
        <button className="primary" disabled={pending || invalid} title={invalid && q && !q.ok ? q.error : undefined} onClick={onApprove}>
          {pending ? <Loader2 size={16} className="spin" /> : <Check size={16} strokeWidth={2.6} />} Approve
        </button>
        <button className="danger" disabled={pending} onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}>
          <X size={16} strokeWidth={2.6} /> Reject
        </button>
      </div>
      {invalid && q && !q.ok && <div className="error">{q.error}</div>}
      {confirmHigh && q && q.ok && order && (
        <div className="rejectbox">
          <span className="muted" style={{ fontSize: 13 }}>
            {q.value.toLocaleString("en-IN")} is more than twice the recommended {order.recommended?.toLocaleString("en-IN")}. Approve it anyway?
          </span>
          <button className="primary" disabled={pending} onClick={() => submit(() => approve(id, q.value))}>Yes, approve {q.value.toLocaleString("en-IN")}</button>
          <button disabled={pending} onClick={() => setConfirmHigh(false)}>Change it</button>
        </div>
      )}
      {rejecting && (
        <div className="rejectbox">
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for rejecting">
            <option value="">Why? (required)</option>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="danger" disabled={pending || !reason} onClick={() => submit(() => reject(id, reason))}>
            Confirm reject
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
