"use client";

import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <label className="muted" htmlFor="pw" style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
        <LockKeyhole size={14} /> Password
      </label>
      <input id="pw" type="password" name="password" placeholder="Enter password" autoFocus />
      <button className="primary" disabled={pending}>
        {pending ? <Loader2 size={17} className="spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
        {!pending && <ArrowRight size={17} />}
      </button>
      {state?.error && <div className="error">{state.error}</div>}
    </form>
  );
}
