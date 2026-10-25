"use client";

import { useState, useTransition } from "react";
import { resume } from "../actions";

export function ResumeForm() {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="rejectbox">
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why is it safe to resume? (required, saved)"
        aria-label="Resume note"
        style={{ flex: "1 1 280px" }}
      />
      <button
        className="primary"
        disabled={pending || note.trim() === ""}
        onClick={() =>
          start(async () => {
            const r = await resume(note);
            if (!r.ok) setError(r.message);
          })
        }
      >
        Resume
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
