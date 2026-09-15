"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BarChart3, CalendarClock, History, LogOut, Target } from "lucide-react";
import { useAuth } from "../lib/auth";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace("/login");
    if (!loading && user && isPublic) router.replace("/");
  }, [loading, user, isPublic, router]);

  if (loading) {
    return (
      <div className="bootScreen">
        <div className="spinner" />
        <p>Loading Plan2Done…</p>
      </div>
    );
  }

  if (isPublic) return <>{children}</>;

  if (!user) {
    return (
      <div className="bootScreen">
        <div className="spinner" />
        <p>Redirecting…</p>
      </div>
    );
  }

  const nav = [
    { href: "/", label: "Today", icon: <Target size={18} /> },
    { href: "/history", label: "History", icon: <History size={18} /> },
    { href: "/analytics", label: "Analytics", icon: <BarChart3 size={18} /> }
  ];

  return (
    <div className="appLayout">
      <header className="appHeader">
        <div className="brand">
          <CalendarClock size={22} />
          <span>Plan2Done</span>
        </div>
        <nav className="mainNav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "navItem active" : "navItem"}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="userMenu">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="userInfo">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="ghostButton" onClick={() => logout()} aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="appMain">{children}</main>
    </div>
  );
}
