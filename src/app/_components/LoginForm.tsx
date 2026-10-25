"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <input type="password" name="password" placeholder="Password" autoFocus aria-label="Password" />
      <button className="primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state?.error && <div className="error">{state.error}</div>}
    </form>
  );
}
