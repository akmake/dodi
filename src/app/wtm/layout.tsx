import AppNavbar from "@/components/wtmbtb/AppNavbar";
import { requireService } from "@/lib/access/guard";

// Mirrors the original client's adminShell (App.jsx): navbar + full-height body.
// Server guard: only users granted the WTM service reach here.
export default async function WtmLayout({ children }: { children: React.ReactNode }) {
  await requireService("wtm");
  return (
    <div className="wtmbtb-scope h-screen flex flex-col" dir="rtl" style={{ background: "#fff", fontFamily: "var(--font-sans)", color: "#111b21" }}>
      <AppNavbar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
