"use client";

import { useState, useTransition } from "react";
import { markLaunchLead } from "../actions";

export function LeadButtons({ id, mark }: { id: number; mark: "interested" | "ignore" | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (m: "interested" | "ignore") =>
    start(async () => {
      setError(null);
      const r = await markLaunchLead(id, m);
      if (!r.ok) setError(r.message);
    });
  return (
    <div>
      <div className="actions">
        <button className={mark === "interested" ? "primary" : ""} disabled={pending || mark === "interested"} onClick={() => set("interested")}>
          Interested
        </button>
        <button className={mark === "ignore" ? "danger" : ""} disabled={pending || mark === "ignore"} onClick={() => set("ignore")}>
          Ignore
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
