import { Check, Sprout } from "lucide-react";
import { LoginForm } from "../_components/LoginForm";
import { getAuthMode } from "@/lib/auth";

const FLOW = ["Sales and stock files are read", "Raghav's rules decide every number", "AI explains each flag", "You approve or reject", "A draft PO is prepared, never sent"];

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark"><Sprout size={22} strokeWidth={2.3} /></span>
          <div>
            <div className="brand-name">Freshroots</div>
            <div className="brand-sub">Demand planning</div>
          </div>
        </div>
        <div>
          <h2>From stale spreadsheets to a weekly flag review.</h2>
          <p>Deterministic rules, AI-written reasons, and a human decision on every order. Drafts only.</p>
        </div>
        <ol className="login-steps">
          {FLOW.map((s) => (
            <li key={s}>
              <span className="pipe-dot done"><Check size={14} strokeWidth={3} /></span>
              {s}
            </li>
          ))}
        </ol>
      </section>
      <section className="login-form">
        <div className="login-box">
          <h1>Welcome back</h1>
          <p className="muted" style={{ margin: 0 }}>
            {getAuthMode() === "open" ? "Open mode: any password is accepted for now." : "Enter the dashboard password to continue."}
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
