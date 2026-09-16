"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BarChart3, CalendarClock, History, LogOut, Target } from "lucide-react";
import { useAuth } from "../lib/auth";

const PUBLIC_ROUTES = ["/login", "/register"];

const NAV = [
  { href: "/", label: "Today", icon: Target },
  { href: "/history", label: "History", icon: History },
  { href: "/analytics", label: "Analytics", icon: BarChart3 }
];

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

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="appLayout">
      <header className="appHeader">
        <div className="brand">
          <CalendarClock size={22} />
          <span>Plan2Done</span>
        </div>

        {/* Desktop / tablet top nav */}
        <nav className="mainNav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "navItem active" : "navItem"}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="userMenu">
          <div className="avatar" title={user.name}>{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="userInfo">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="ghostButton" onClick={() => logout()} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="appMain">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="bottomNav">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? "tabItem active" : "tabItem"}>
              <Icon size={22} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
