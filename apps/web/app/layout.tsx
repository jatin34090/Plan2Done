import type { Metadata } from "next";
import "./styles.css";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "Plan2Done — Plan vs Actual",
  description: "Daily goal planning, execution journaling, and plan-vs-actual reflection."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
