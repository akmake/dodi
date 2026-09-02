import Sidebar from "@/components/Sidebar";
import { requireService } from "@/lib/access/guard";

// WBR (the bootWhat dashboard) is one of the three services; guard it the same.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireService("wbr");
  return (
    <div className="wbr-app">
      <Sidebar />
      <main className="wbr-content">{children}</main>
    </div>
  );
}
