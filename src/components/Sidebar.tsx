"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, BookOpen, Bot, CalendarClock, ChevronLeft,
  CreditCard, Database, FileText, GitBranch, Inbox, LayoutDashboard, LogOut,
  Menu, MessageCircleMore, MoreHorizontal, PlugZap, Search, Send, Settings,
  ShieldCheck, ShoppingBag, Sparkles, Smartphone, Target, Ticket, Users, X, Zap,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const primary: NavItem[] = [
  { href: "/dashboard", label: "סקירה", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "שיחות", icon: Inbox },
  { href: "/dashboard/contacts", label: "אנשי קשר", icon: Users },
  { href: "/dashboard/flows", label: "תהליכים", icon: GitBranch },
];

const sections: Array<{ label: string; items: NavItem[] }> = [
  { label: "ניהול לקוחות", items: [
    { href: "/dashboard/leads", label: "לידים", icon: Target },
    { href: "/dashboard/tickets", label: "טיקטים", icon: Ticket },
    { href: "/dashboard/appointments", label: "תורים", icon: CalendarClock },
  ]},
  { label: "אוטומציה", items: [
    { href: "/dashboard/triggers", label: "טריגרים", icon: Zap },
    { href: "/dashboard/ai", label: "סוכן AI", icon: Bot },
    { href: "/dashboard/knowledge", label: "מאגר ידע", icon: BookOpen },
    { href: "/dashboard/skills", label: "כישורי AI", icon: Sparkles },
    { href: "/dashboard/data", label: "מאגרי מידע", icon: Database },
  ]},
  { label: "שיווק וצמיחה", items: [
    { href: "/dashboard/broadcasts", label: "קמפיינים", icon: Send },
    { href: "/dashboard/templates", label: "תבניות", icon: FileText },
    { href: "/dashboard/segments", label: "קהלים", icon: Users },
    { href: "/dashboard/ecommerce", label: "מסחר", icon: ShoppingBag },
    { href: "/dashboard/analytics", label: "אנליטיקה", icon: BarChart3 },
  ]},
  { label: "מערכת", items: [
    { href: "/dashboard/whatsapp", label: "חיבור WhatsApp", icon: MessageCircleMore },
    { href: "/dashboard/sms", label: "SMS", icon: Smartphone },
    { href: "/dashboard/integrations", label: "אינטגרציות", icon: PlugZap },
    { href: "/dashboard/users", label: "צוות והרשאות", icon: ShieldCheck },
    { href: "/dashboard/billing", label: "חיוב ומכסות", icon: CreditCard },
    { href: "/dashboard/settings", label: "הגדרות", icon: Settings },
  ]},
];

function Brand() {
  return <span className="wbr-brand-mark"><MessageCircleMore size={19} strokeWidth={2.4} /></span>;
}

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  const navLink = ({ href, label, icon: Icon }: NavItem) => (
    <Link key={href} href={href} className={active(href) ? "active" : ""}>
      <span className="wbr-nav-icon"><Icon size={18} strokeWidth={active(href) ? 2.35 : 1.8} /></span>
      <span>{label}</span>
      <ChevronLeft className="wbr-nav-arrow" size={14} />
    </Link>
  );

  return <>
    <header className="wbr-mobile-head">
      <button onClick={() => setOpen(true)} aria-label="פתיחת תפריט"><Menu /></button>
      <Link href="/dashboard" className="wbr-mobile-brand"><Brand /><b>bootWhat</b></Link>
      <div><button aria-label="חיפוש"><Search /></button><button aria-label="התראות"><Bell /></button></div>
    </header>

    {open && <button className="wbr-scrim" aria-label="סגירת תפריט" onClick={() => setOpen(false)} />}

    <aside className={`wbr-sidebar ${open ? "is-open" : ""}`} aria-label="ניווט ראשי">
      <div className="wbr-side-head">
        <Link href="/services" className="wbr-brand"><Brand /><span><b>bootWhat</b><small>WHATSAPP OPERATING SYSTEM</small></span></Link>
        <button className="wbr-side-close" onClick={() => setOpen(false)} aria-label="סגירה"><X /></button>
      </div>

      <div className="wbr-workspace">
        <span>BW</span><div><small>סביבת עבודה</small><b>המרחב העסקי</b></div><ChevronLeft />
      </div>

      <nav className="wbr-navigation">
        <section className="wbr-primary-nav">{primary.map(navLink)}</section>
        {sections.map(section => <section key={section.label}><h3>{section.label}</h3>{section.items.map(navLink)}</section>)}
      </nav>

      <div className="wbr-side-foot">
        <Link href="/dashboard/whatsapp" className="wbr-connection">
          <i /><span><b>WhatsApp פעיל</b><small>Cloud API מחובר</small></span><ChevronLeft />
        </Link>
        <div className="wbr-side-actions">
          <Link href="/dashboard/settings"><Settings />הגדרות</Link>
          <button onClick={logout}><LogOut />יציאה</button>
        </div>
      </div>
    </aside>

    <nav className="wbr-bottom-nav" aria-label="ניווט מהיר">
      {primary.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={active(href) ? "active" : ""}><Icon /><span>{label}</span></Link>)}
      <button onClick={() => setOpen(true)}><MoreHorizontal /><span>עוד</span></button>
    </nav>
  </>;
}
