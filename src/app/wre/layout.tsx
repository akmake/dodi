import { requireService } from "@/lib/access/guard";

export default async function WreLayout({ children }: { children: React.ReactNode }) {
  await requireService("wre");
  return <main className="wre-radar" dir="rtl">{children}</main>;
}
