"use client";

import { ExternalLink, FileCheck2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShellData } from "@/lib/shell";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** A quick look at the latest draft POs from anywhere in the app: header button + small drop-down. */
export function PoGlimpse({ pos, listUrl }: { pos: ShellData["pos"]; listUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popwrap" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <FileCheck2 size={16} />
        Purchase orders
        <span className="btn-count">{pos.length}</span>
      </button>
      {open && (
        <div className="card pop po-glimpse" role="dialog" aria-label="Latest draft purchase orders">
          <div className="po-glimpse-title">Latest draft POs in Zoho</div>
          {pos.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>None yet. Approve ORDER_NOW flags and press Create draft PO.</p>
          ) : (
            pos.map((p) => (
              <div key={p.number} className="glimpse-row">
                <div>
                  <strong>{p.number}</strong> <span className="chip ok" style={{ marginLeft: 6 }}>{p.status}</span>
                  <div className="muted" style={{ fontSize: 12.5 }}>{p.lines}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{when(p.createdAt)} IST</div>
                </div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.number} in Zoho`}>
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            ))
          )}
          {listUrl && (
            <a className="glimpse-all" href={listUrl} target="_blank" rel="noopener noreferrer">
              All purchase orders in Zoho <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
