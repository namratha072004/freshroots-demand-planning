"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { approve, reject } from "../actions";

export interface ReasonOption {
  value: string;
  label: string;
}

export function DecisionButtons({ id, reasons }: { id: number; reasons: ReasonOption[] }) {
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
        <button className="primary" disabled={pending} onClick={() => submit(() => approve(id))}>
          {pending ? <Loader2 size={16} className="spin" /> : <Check size={16} strokeWidth={2.6} />} Approve
        </button>
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
