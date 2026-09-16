import type { Metadata, Viewport } from "next";
import "./styles.css";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { PwaProvider } from "./components/PwaProvider";

export const metadata: Metadata = {
  applicationName: "Plan2Done",
  title: "Plan2Done — Plan vs Actual",
  description: "Daily goal planning, execution journaling, and plan-vs-actual reflection.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Plan2Done"
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <PwaProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
