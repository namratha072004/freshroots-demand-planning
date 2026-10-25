"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import { approve, reject } from "../actions";

export interface ReasonOption {
  value: string;
  label: string;
}

/** Approve (what the system suggested), Edit (change the quantity first), Reject (with a reason). */
export function DecisionButtons({ id, reasons, onEdit }: { id: number; reasons: ReasonOption[]; onEdit?: () => void }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(fn: () => ReturnType<typeof approve>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
    });
  }

  return (
    <div>
      <div className="actions">
        <button className="primary" disabled={pending} onClick={() => submit(() => approve(id))} title="Approve exactly what the system suggested">
          {pending ? <Loader2 size={16} className="spin" /> : <Check size={16} strokeWidth={2.6} />} Approve
        </button>
        {onEdit && (
          <button disabled={pending} onClick={onEdit} title="Change the quantity before approving">
            <Pencil size={14} /> Edit
          </button>
        )}
        <button className="danger" disabled={pending} onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}>
          <X size={16} strokeWidth={2.6} /> Reject
        </button>
      </div>
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
