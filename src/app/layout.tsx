import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";

/**
 * Assistant — a Hebrew-first web font with a clear grid at small sizes, exposed
 * as the design system's --font-sans (specs/redesign/02-VISUAL-SYSTEM.md §3.4).
 */
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "bootWhat — WhatsApp Bot Platform",
  description: "AI-powered WhatsApp automation platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body>{children}</body>
    </html>
  );
}
