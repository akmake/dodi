"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CircleDot, Mail, MessageSquareText, RadioTower, Shield, Sparkles, UsersRound } from "lucide-react";
import { SERVICE_LIST, type ServiceDef } from "@/lib/wtmbtb/services";
import { useAccess } from "@/lib/access/useAccess";
import type { ServiceId } from "@/modules/admin/models";

const META: Record<string, { index: string; eyebrow: string; icon: React.ReactNode; tone: string }> = {
  wbr: { index: "01", eyebrow: "AI OPERATIONS", icon: <Sparkles />, tone: "mint" },
  wre: { index: "02", eyebrow: "PROPERTY RADAR", icon: <Building2 />, tone: "copper" },
  wtm: { index: "03", eyebrow: "MESSAGE BRIDGE", icon: <Mail />, tone: "ocean" },
  wta: { index: "04", eyebrow: "GROUP CONTROL", icon: <UsersRound />, tone: "violet" },
  btb: { index: "05", eyebrow: "STATUS INTELLIGENCE", icon: <RadioTower />, tone: "blue" },
};

function ProductCard({ service, featured, onOpen }: { service: ServiceDef; featured?: boolean; onOpen: () => void }) {
  const meta = META[service.id] ?? { index: "—", eyebrow: "PRODUCT", icon: <CircleDot />, tone: "mint" };
  return (
    <button className={`hub-product hub-${meta.tone} ${featured ? "hub-featured" : ""}`} onClick={onOpen} disabled={!service.active}>
      <span className="hub-product-index">{meta.index}</span>
      <span className="hub-product-icon">{meta.icon}</span>
      <span className="hub-product-copy">
        <small>{meta.eyebrow}</small>
        <strong>{service.name}</strong>
        <em>{service.title}</em>
        <p>{service.desc}</p>
      </span>
      <span className="hub-product-foot">
        <span className="hub-live"><i /> {service.active ? "פעיל" : "בקרוב"}</span>
        <span className="hub-enter">כניסה למוצר <ArrowLeft /></span>
      </span>
      <span className="hub-orbit" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const { loading, isAdmin, allowedServices } = useAccess();
  const visible = SERVICE_LIST.filter((service) => allowedServices.includes(service.id as ServiceId));
  const ordered = [...visible].sort((a, b) => (a.id === "wbr" ? -1 : b.id === "wbr" ? 1 : a.id === "wre" ? -1 : b.id === "wre" ? 1 : 0));

  return (
    <main className="product-hub" dir="rtl">
      <div className="hub-noise" />
      <header className="hub-header">
        <a className="hub-mark" href="/"><span>B</span><b>bootWhat</b><small>PRODUCT ECOSYSTEM</small></a>
        <div className="hub-header-right">
          <span className="hub-system"><i /> כל המערכות פעילות</span>
          {isAdmin && <button onClick={() => router.push("/admin")}><Shield /> ניהול מערכת</button>}
        </div>
      </header>

      <section className="hub-intro">
        <div>
          <small>YOUR DIGITAL WORKSPACE</small>
          <h1>כל כלי העבודה.<br /><span>מרחב אחד.</span></h1>
        </div>
        <p>מערכת מוצרים חכמה שמחברת בין WhatsApp, אנשים ופעילות עסקית — ובונה סדר מתוך הרעש.</p>
      </section>

      {loading ? (
        <div className="hub-loading"><MessageSquareText /><span>מכינים את סביבת העבודה…</span></div>
      ) : ordered.length === 0 ? (
        <div className="hub-empty"><Shield /><h2>עדיין אין מוצרים במרחב שלך</h2><p>מנהל המערכת יכול להקצות לך גישה למוצרים.</p></div>
      ) : (
        <section className="hub-grid">
          {ordered.map((service, index) => <ProductCard key={service.id} service={service} featured={index === 0} onOpen={() => router.push(service.path)} />)}
        </section>
      )}

      <footer className="hub-footer"><span>bootWhat / Product Hub</span><span>{visible.length} מוצרים זמינים עבורך</span></footer>
    </main>
  );
}
