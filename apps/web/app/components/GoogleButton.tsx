"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// Minimal typing for the Google Identity Services global we use.
interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleId {
  initialize: (config: { client_id: string; callback: (r: GoogleCredentialResponse) => void }) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject(new Error("no document"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Google script"));
    document.head.appendChild(s);
  });
}

export function GoogleButton() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const id = window.google?.accounts?.id;
        if (!id) return;
        id.initialize({
          client_id: CLIENT_ID,
          callback: async (response) => {
            try {
              await loginWithGoogle(response.credential);
              router.replace("/");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            }
          }
        });
        id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 320,
          logo_alignment: "center"
        });
      })
      .catch(() => setError("Could not load Google sign-in"));

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, router]);

  // Feature is optional: render nothing if no client id is configured.
  if (!CLIENT_ID) return null;

  return (
    <div className="googleAuth">
      <div className="authDivider"><span>or</span></div>
      <div ref={containerRef} className="googleButtonHost" />
      {error && <p className="formError">{error}</p>}
    </div>
  );
}
