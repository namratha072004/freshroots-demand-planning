"use client";

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
    <div>
      <button
        className="primary"
        disabled={pending || stopped}
        title={stopped ? "Blocked by the kill switch" : undefined}
        onClick={() => (pendingCount > 0 ? setConfirming(true) : run(false))}>
        {pending ? "Running… (1-2 minutes)" : "Run now"}
      </button>
      {confirming && (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>{pendingCount} flags have no answer yet.</strong> Running again marks them SUPERSEDED. They are not
          counted as rejections.
          <div className="rejectbox">
            <button className="primary" disabled={pending} onClick={() => run(true)}>
              Run anyway
            </button>
            <button disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <div className={message.error ? "error" : "meta"}>{message.text}</div>}
    </div>
  );
}
