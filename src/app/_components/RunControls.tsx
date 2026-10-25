"use client";

import { Loader2, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { runNow } from "../actions";

export function RunControls({ pendingCount, stopped }: { pendingCount: number; stopped: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function run(confirmSupersede: boolean) {
    setMessage(null);
    start(async () => {
      const r = await runNow(confirmSupersede);
      if (!r.ok && r.needsConfirm) {
        setConfirming(true);
        return;
      }
      setConfirming(false);
      setMessage({ text: r.message ?? "", error: !r.ok });
    });
  }

  return (
    <div className="popwrap">
      <button
        className="primary"
        disabled={pending || stopped}
        title={stopped ? "Blocked by the kill switch" : undefined}
        onClick={() => (pendingCount > 0 ? setConfirming(true) : run(false))}
      >
        {pending ? <Loader2 size={16} className="spin" /> : <Play size={15} fill="currentColor" />}
        {pending ? "Running, 1-2 minutes…" : "Run now"}
      </button>
      {confirming && (
        <div className="card pop" role="dialog" aria-label="Confirm run">
          <p>
            <strong>{pendingCount} {pendingCount === 1 ? "flag has" : "flags have"} no answer yet.</strong> Running again marks {pendingCount === 1 ? "it" : "them"} SUPERSEDED.
            They are not counted as rejections.
          </p>
          <div className="actions">
            <button className="primary" disabled={pending} onClick={() => run(true)}>Run anyway</button>
            <button disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {message && !confirming && <div className="run-note" style={message.error ? { color: "var(--bad-ink)" } : undefined}>{message.text}</div>}
    </div>
  );
}
