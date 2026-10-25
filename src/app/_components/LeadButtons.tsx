"use client";

import { Bookmark, EyeOff, Loader2 } from "lucide-react";
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
          {pending ? <Loader2 size={15} className="spin" /> : <Bookmark size={15} />} Interested
        </button>
        <button className={mark === "ignore" ? "danger" : ""} disabled={pending || mark === "ignore"} onClick={() => set("ignore")}>
          <EyeOff size={15} /> Ignore
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
