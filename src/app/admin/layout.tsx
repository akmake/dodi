import Link from "next/link";
import { requireAdmin } from "@/lib/access/guard";

// Platform admin area — only users carrying `users.manage` reach here.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="wtmbtb-scope min-h-screen flex flex-col" dir="rtl" style={{ background: "#f8fafc", fontFamily: "var(--font-sans)", color: "#111b21" }}>
      <header className="flex items-center gap-3 px-6 h-14 flex-shrink-0 text-white" style={{ background: "#563554" }}>
        <Link href="/services" className="text-sm text-white/70 hover:text-white transition">
          ← כל השירותים
        </Link>
        <span className="font-bold text-sm">ניהול פלטפורמה</span>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
