import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Plan2Done",
  description: "Daily goal planning, execution journaling, and plan-vs-actual reflection."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
