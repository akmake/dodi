"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Building2, ChevronDown, CircleUserRound, Filter, Layers3, Map, Menu, MessageCircle, Plus, Radar, Search, Settings2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { wreApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import { toWaMe } from "@/modules/wre/phone";
import type { MapListing } from "./ListingMap";
import TabGroups from "./tabs/TabGroups";
import TabCapture from "./tabs/TabCapture";
import TabQueryAccess from "./tabs/TabQueryAccess";
import EditAddressModal from "./modals/EditAddressModal";

const ListingMap = dynamic(() => import("./ListingMap"), { ssr: false, loading: () => <div className="wre-map-loading">מכינים את המפה…</div> });
const money = (n: number | null) => n == null ? "מחיר לא צוין" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")} מ׳ ₪` : `${n.toLocaleString("he-IL")} ₪`;
const ago = (d: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : `לפני ${Math.round(m / 1440)} ימים`; };

export default function WreRadar({ clients, client, onSelect, onAdd, onQR, onSaved }: any) {
  const [rows, setRows] = useState<MapListing[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [deal, setDeal] = useState("");
  const [days, setDays] = useState("7");
  const [selectedListing, setSelectedListing] = useState<MapListing | null>(null);
  const [workspace, setWorkspace] = useState<"radar" | "review" | "sources" | "settings">("radar");
  const [mobileMap, setMobileMap] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const fetchListings = useCallback(async () => {
    if (!client?._id) return;
    setLoading(true);
    try {
      const params: Record<string, string | string[]> = { limit: "500" };
      if (workspace === "review") params.status = ["needs_review", "low_confidence"];
      else params.status = ["mapped", "needs_review"];
      if (search.trim()) params.search = search.trim();
      if (city) params.city = city;
      if (deal) params.dealType = deal;
      if (days) params.days = days;
      const data = (await wreApi.get<any>(`/clients/${client._id}/listings`, { params })).data;
      setRows(data.listings ?? []); setCities(data.cities ?? []); setStats(data.byStatus ?? {});
    } finally { setLoading(false); }
  }, [client?._id, city, days, deal, search, workspace]);

  useEffect(() => { const t = setTimeout(fetchListings, search ? 300 : 0); return () => clearTimeout(t); }, [fetchListings, search]);
  useSSE(fetchListings);

  const visibleRows = useMemo(() => rows.filter((r) => !["not_listing", "skipped", "rejected"].includes(r.status)), [rows]);
  const movePin = async (id: string, lat: number, lng: number) => {
    setRows((all) => all.map((l) => l._id === id ? { ...l, lat, lng, status: "mapped", manualPin: true, reviewReason: null, houseNumberApprox: false } : l));
    await wreApi.put(`/clients/${client._id}/listings/${id}`, { action: "pin", lat, lng }).catch(fetchListings);
  };

  if (!client) return <EmptyState onAdd={onAdd} />;
  const connected = client.waStatus === "connected";

  return (
    <div className="wre-shell">
      <aside className={`wre-nav ${navOpen ? "is-open" : ""}`}>
        <button className="wre-nav-close" onClick={() => setNavOpen(false)}><X /></button>
        <Link href="/services" className="wre-brand"><span><Radar size={22} /></span><b>WRE</b><small>PROPERTY RADAR</small></Link>
        <nav>
          <NavButton active={workspace === "radar"} icon={<Radar />} label="רדאר" onClick={() => setWorkspace("radar")} />
          <NavButton active={workspace === "review"} icon={<Sparkles />} label="דורש אימות" count={stats.needs_review} onClick={() => setWorkspace("review")} />
          <NavButton active={workspace === "sources"} icon={<Layers3 />} label="מקורות" onClick={() => setWorkspace("sources")} />
        </nav>
        <div className="wre-nav-bottom">
          <NavButton active={workspace === "settings"} icon={<Settings2 />} label="הגדרות איסוף" onClick={() => setWorkspace("settings")} />
          <Link href="/services" className="wre-user"><CircleUserRound /><span>חזרה למוצרים<small>bootWhat workspace</small></span></Link>
        </div>
      </aside>

      <section className="wre-main">
        <header className="wre-topbar">
          <button className="wre-mobile-menu" onClick={() => setNavOpen(true)}><Menu /></button>
          <div className="wre-client-picker"><span className={connected ? "live" : ""} /><select value={client._id} onChange={(e) => onSelect(e.target.value)}>{clients.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}</select><ChevronDown /></div>
          <div className="wre-top-actions"><button aria-label="התראות"><Bell /></button><button className="wre-add-source" onClick={onAdd}><Plus /> חשבון חדש</button></div>
        </header>

        {(workspace === "sources" || workspace === "settings") ? (
          <div className="wre-settings-page">
            <div className="wre-page-title"><small>{workspace === "sources" ? "SOURCES" : "CAPTURE ENGINE"}</small><h1>{workspace === "sources" ? "מקורות הקליטה" : "הגדרות האיסוף"}</h1><p>{workspace === "sources" ? "בחרו אילו קבוצות מזינות את הרדאר והגדירו להן הקשר מקומי." : "כוונו את רגישות החילוץ, מניעת הכפילויות ואיכות התוצאות."}</p></div>
            {!connected && <button className="wre-connect" onClick={onQR}>חיבור WhatsApp באמצעות QR</button>}
            {workspace === "sources" ? (
              <>
                <div className="wre-settings-card"><TabGroups client={client} onSaved={onSaved} /></div>
                <div className="wre-settings-card"><TabQueryAccess client={client} onSaved={onSaved} /></div>
              </>
            ) : (
              <div className="wre-settings-card"><TabCapture client={client} onSaved={onSaved} /></div>
            )}
          </div>
        ) : (
          <>
            <div className="wre-hero">
              <div><small>LIVE PROPERTY INTELLIGENCE</small><h1>{workspace === "review" ? "תור האימות" : "בוקר טוב, " + client.name}</h1><p>{workspace === "review" ? "הנכסים שצריכים עין אנושית לפני שהם עולים למפה." : `${visibleRows.length} נכסים פעילים מהקבוצות שלך כרגע.`}</p></div>
              {!connected && <button className="wre-connect" onClick={onQR}><span /> חברו את WhatsApp כדי להתחיל</button>}
            </div>
            <div className="wre-commandbar">
              <label className="wre-search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי עיר, רחוב או תוכן ההודעה…" /></label>
              <div className="wre-filter-group"><select value={city} onChange={(e) => setCity(e.target.value)}><option value="">כל האזורים</option>{cities.map(c => <option key={c}>{c}</option>)}</select><select value={deal} onChange={(e) => setDeal(e.target.value)}><option value="">כל העסקאות</option><option value="sale">למכירה</option><option value="rent">להשכרה</option></select><select value={days} onChange={(e) => setDays(e.target.value)}><option value="1">היום</option><option value="7">7 ימים</option><option value="30">30 ימים</option><option value="">כל הזמן</option></select><button title="מסננים"><SlidersHorizontal /></button></div>
            </div>
            <div className="wre-mobile-switch"><button className={!mobileMap ? "active" : ""} onClick={() => setMobileMap(false)}><Building2 /> נכסים</button><button className={mobileMap ? "active" : ""} onClick={() => setMobileMap(true)}><Map /> מפה</button></div>
            <div className={`wre-workspace ${mobileMap ? "show-map" : ""}`}>
              <section className="wre-feed">
                <div className="wre-feed-head"><span>{loading ? "מעדכן…" : `${visibleRows.length} תוצאות`}</span><button><Filter /> החדשים ביותר</button></div>
                <div className="wre-listings">{visibleRows.map((l) => <ListingCard key={l._id} listing={l} selected={selectedListing?._id === l._id} onClick={() => setSelectedListing(l)} onEdit={() => setSelectedListing(l)} />)}{!loading && visibleRows.length === 0 && <div className="wre-no-results"><Radar /><h3>הרדאר שקט כרגע</h3><p>לא נמצאו נכסים שמתאימים למסננים שבחרת.</p></div>}</div>
              </section>
              <section className="wre-map"><ListingMap listings={visibleRows} onMovePin={movePin} /><div className="wre-map-legend"><span><i className="verified" /> כתובת מאומתת</span><span><i className="approx" /> מספר בית משוער</span><span><i className="review" /> דורש בדיקה</span></div></section>
            </div>
          </>
        )}
      </section>
      {selectedListing && <PropertyDrawer listing={selectedListing} clientId={client._id} onClose={() => setSelectedListing(null)} onUpdated={fetchListings} />}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: any) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>; }
function ListingCard({ listing: l, selected, onClick }: any) { const review = l.status === "needs_review"; const approx = !review && l.houseNumberApprox; return <article className={`wre-listing ${selected ? "selected" : ""}`} onClick={onClick}><div className="wre-listing-top"><span className={`wre-deal ${l.dealType}`}>{l.dealType === "rent" ? "להשכרה" : "למכירה"}</span><time>{ago(l.messageAt)}</time></div><h2>{l.street ? `${l.street} ${l.houseNumber}${approx ? "*" : ""}` : "כתובת חסרה"}</h2><p className="wre-location">{l.city}{l.neighborhood ? ` · ${l.neighborhood}` : ""}</p><strong>{money(l.price)}</strong><div className="wre-facts"><span>{l.rooms ?? "—"}<small>חדרים</small></span><span>{l.sizeSqm ?? "—"}<small>מ״ר</small></span><span>{l.floor ?? "—"}<small>קומה</small></span></div><footer><span className={review ? "needs-review" : approx ? "approx" : "verified"}>{review ? "דורש אימות" : approx ? "מספר בית משוער*" : "כתובת אומתה"}</span><small>{l.groupName}</small></footer></article>; }
function PropertyDrawer({ listing: l, clientId, onClose, onUpdated }: any) { const [edit, setEdit] = useState(false); return <><div className="wre-drawer-backdrop" onClick={onClose} /><aside className="wre-drawer"><button className="wre-drawer-close" onClick={onClose}><X /></button><div className="wre-drawer-kicker">PROPERTY BRIEF</div><span className={`wre-deal ${l.dealType}`}>{l.dealType === "rent" ? "להשכרה" : "למכירה"}</span><h2>{l.street || "כתובת חסרה"} {l.houseNumber}</h2><p>{l.city}{l.neighborhood ? ` · ${l.neighborhood}` : ""}</p>{l.houseNumberApprox && <p className="wre-approx-warning">⚠ מספר הבית ({l.houseNumber}) אינו אמיתי — ההודעה לא ציינה מספר בית, וזה פלייסהולדר כדי שהסיכה תופיע על הרחוב הנכון. הסיכה ניתנת לגרירה למיקום המדויק.</p>}<strong className="wre-drawer-price">{money(l.price)}</strong><div className="wre-drawer-facts"><span><b>{l.rooms ?? "—"}</b> חדרים</span><span><b>{l.sizeSqm ?? "—"}</b> מ״ר</span><span><b>{l.floor ?? "—"}</b> קומה</span></div>{l.features?.length > 0 && <div className="wre-tags">{l.features.map((x: string) => <span key={x}>{x}</span>)}</div>}<div className="wre-source"><small>הודעת המקור</small><p>{l.rawText}</p><footer>{l.groupName} · {l.senderName}</footer></div><div className="wre-drawer-actions">{l.contactPhone && <a href={`https://wa.me/${toWaMe(l.contactPhone)}`} target="_blank" rel="noreferrer"><MessageCircle /> דברו עם המפרסם</a>}<button onClick={() => setEdit(true)}>תקנו כתובת</button></div></aside>{edit && <EditAddressModal clientId={clientId} listing={l} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onUpdated(); }} />}</>; }
function EmptyState({ onAdd }: { onAdd: () => void }) { return <div className="wre-empty"><div className="wre-brand"><span><Radar /></span><b>WRE</b></div><div><small>PROPERTY INTELLIGENCE</small><h1>הנכסים מחכים להתגלות.</h1><p>חברו חשבון WhatsApp, בחרו קבוצות והרדאר יהפוך הודעות למפת הזדמנויות חיה.</p><button onClick={onAdd}><Plus /> הקמת חשבון ראשון</button></div></div>; }
