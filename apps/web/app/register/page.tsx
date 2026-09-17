"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { GoogleButton } from "../components/GoogleButton";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(name, email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
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
        <h1>Create your account</h1>
        <p className="authSub">Start tracking plan vs. actual today.</p>

        <form onSubmit={onSubmit} className="authForm">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ada Lovelace" />
          </label>
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
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </label>
          {error && <p className="formError">{error}</p>}
          <button type="submit" className="primaryButton" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <GoogleButton />

        <p className="authSwitch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
