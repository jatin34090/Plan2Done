"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: User }>("/api/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await api.post<{ user: User; token: string }>("/api/auth/login", {
      email,
      password
    });
    setToken(token);
    setUser(user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { user, token } = await api.post<{ user: User; token: string }>("/api/auth/register", {
      name,
      email,
      password,
      timezone: tz
    });
    setToken(token);
    setUser(user);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { user, token } = await api.post<{ user: User; token: string }>("/api/auth/google", {
      credential
    });
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
