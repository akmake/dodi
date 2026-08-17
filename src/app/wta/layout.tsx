import AppNavbar from "@/components/wtmbtb/AppNavbar";
import { requireService } from "@/lib/access/guard";

// Same shell as WTM/BTB: service navbar + full-height body.
// Server guard: only users granted the WTA service reach here.
export default async function WtaLayout({ children }: { children: React.ReactNode }) {
  await requireService("wta");
  return (
    <div className="wtmbtb-scope h-screen flex flex-col" dir="rtl" style={{ background: "#fff", fontFamily: "var(--font-sans)", color: "#111b21" }}>
      <AppNavbar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
