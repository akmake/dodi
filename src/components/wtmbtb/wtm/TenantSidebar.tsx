"use client";
// Port of Whatsapp/client/src/components/admin/TenantSidebar.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { WA_STATUS } from "@/components/wtmbtb/ui/constants";

const BILLING: Record<string, any> = {
  active: { label: "פעיל", cls: "bg-emerald-100 text-emerald-700" },
  overdue: { label: "חייב", cls: "bg-red-100 text-red-700 font-semibold" },
  trial: { label: "ניסיון", cls: "bg-violet-100 text-violet-700" },
  suspended: { label: "מושהה", cls: "bg-amber-100 text-amber-700" },
  cancelled: { label: "בוטל", cls: "bg-slate-100 text-slate-500" },
};

const AVATAR_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500"];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const FILTERS = [
  { key: "", label: "הכל" },
  { key: "active", label: "פעילים" },
  { key: "overdue", label: "חייבים" },
  { key: "trial", label: "ניסיון" },
  { key: "suspended", label: "מושהים" },
];

function CustomerRow({ tenant: t, selected, onClick }: { tenant: any; selected: boolean; onClick: () => void }) {
  const ws = WA_STATUS[t.waStatus] || WA_STATUS.disconnected;
  const bs = BILLING[t.billingStatus] || BILLING.trial;
  const col = avatarColor(t.name);

  return (
    <button
      onClick={onClick}
      className={`w-full text-right flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 transition-all ${selected ? "bg-indigo-50 border-r-2 border-r-indigo-500" : "hover:bg-slate-50"}`}
    >
      <div className={`w-10 h-10 rounded-full ${col} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>{t.name.charAt(0).toUpperCase()}</div>
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${bs.cls}`}>{bs.label}</span>
          <span className="text-sm font-semibold text-slate-800 truncate">{t.name}</span>
        </div>
        <div className="flex items-center justify-end gap-2 mt-0.5">
          <span className="text-[10px] flex items-center gap-1 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ws.dot}`} />
            <span className="text-slate-400">{ws.text}</span>
          </span>
          <span className="text-xs text-slate-400 font-mono truncate">{t.phone}</span>
        </div>
      </div>
    </button>
  );
}

export default function TenantSidebar({ tenants, selectedId, onSelect, onAdd }: { tenants: any[]; selectedId: string | null; onSelect: (id: string) => void; onAdd: () => void }) {
  const [search, setSearch] = useState("");
  const [activeFilter, setFilter] = useState("");

  const total = tenants.length;
  const connected = tenants.filter((t) => t.waStatus === "connected").length;
  const overdue = tenants.filter((t) => t.billingStatus === "overdue").length;

  const filtered = tenants.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.phone.includes(search);
    const matchFilter = !activeFilter || t.billingStatus === activeFilter;
    return matchSearch && matchFilter;
  });

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col bg-white border-l border-slate-200 shadow-sm" style={{ direction: "rtl" }}>
      <div className="px-4 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onAdd} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            לקוח חדש
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-800">לקוחות</h2>
            <p className="text-[11px] text-slate-400">
              {connected}/{total} מחוברים
              {overdue > 0 && <span className="text-red-500 mr-1">· {overdue} חייבים</span>}
            </p>
          </div>
        </div>

        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לקוח..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
          />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto flex-shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition ${activeFilter === f.key ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {f.label}
            {f.key === "overdue" && overdue > 0 && <span className={`mr-1 ${activeFilter === "overdue" ? "text-red-200" : "text-red-500"}`}>({overdue})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm text-slate-400">{total === 0 ? 'לחץ "לקוח חדש" כדי להתחיל' : "לא נמצאו תוצאות"}</p>
          </div>
        ) : (
          filtered.map((t) => <CustomerRow key={t._id} tenant={t} selected={selectedId === t._id} onClick={() => onSelect(t._id)} />)
        )}
      </div>

      {total > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 flex justify-between text-[11px] text-slate-400">
          <span>{filtered.length} מוצגים</span>
          <span>{total} סה&quot;כ</span>
        </div>
      )}
    </aside>
  );
}
