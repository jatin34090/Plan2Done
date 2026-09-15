"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authScreen">
      <div className="authCard">
        <div className="authBrand">
          <CalendarClock size={26} />
          <span>Plan2Done</span>
        </div>
        <h1>Welcome back</h1>
        <p className="authSub">Plan your day, journal what actually happened.</p>

        <form onSubmit={onSubmit} className="authForm">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>
          {error && <p className="formError">{error}</p>}
          <button type="submit" className="primaryButton" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="authSwitch">
          New here? <Link href="/register">Create an account</Link>
        </p>
        <p className="authHint">Demo: demo@plan2done.local / demopass123</p>
      </div>
    </div>
  );
}
