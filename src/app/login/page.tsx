import { LoginForm } from "../_components/LoginForm";
import { getAuthMode } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="login">
      <div className="card">
        <h1>Freshroots Demand Planning</h1>
        <p className="meta">
          {getAuthMode() === "open" ? "Open mode: any password is accepted for now." : "Enter the dashboard password."}
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
