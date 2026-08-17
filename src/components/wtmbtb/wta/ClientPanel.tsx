"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { WA_STATUS } from "@/components/wtmbtb/ui/constants";
import TabInfo from "./tabs/TabInfo";
import TabGroups from "./tabs/TabGroups";
import TabRules from "./tabs/TabRules";
import TabActivity from "./tabs/TabActivity";
import TabSecurity from "./tabs/TabSecurity";

const BILLING: Record<string, any> = {
  active: { label: "פעיל", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overdue: { label: "חייב", cls: "bg-red-100 text-red-700 border-red-200" },
  trial: { label: "ניסיון", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  suspended: { label: "מושהה", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  cancelled: { label: "בוטל", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

const WA_BADGE: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-700",
  connecting: "bg-yellow-100 text-yellow-700",
  waiting_qr: "bg-blue-100 text-blue-700",
  disconnected: "bg-slate-100 text-slate-500",
};

const AVATAR_COLORS = ["bg-purple-500", "bg-fuchsia-500", "bg-violet-500", "bg-indigo-500", "bg-pink-500", "bg-cyan-500", "bg-emerald-500", "bg-amber-500"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const PLAN_LABELS: Record<string, string> = { trial: "ניסיון", monthly: "חודשי", annual: "שנתי", custom: "מותאם" };

const TABS = [
  { key: "info", label: "סקירה", icon: "📋" },
  { key: "groups", label: "קבוצות", icon: "👥" },
  { key: "rules", label: "חוקים", icon: "🛡️" },
  { key: "activity", label: "יומן", icon: "📜" },
  { key: "security", label: "אבטחה", icon: "🔐" },
];

export default function ClientPanel({
  client: c,
  onQR,
  qrLoading,
  onReconnect,
  onDelete,
  onEdit,
  onSaved,
}: {
  client: any;
  onQR: () => void;
  qrLoading: boolean;
  onReconnect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [activeTab, setActiveTab] = useState("info");
  const ws = WA_STATUS[c.waStatus] || WA_STATUS.disconnected;
  const bs = BILLING[c.billingStatus] || BILLING.trial;
  const col = avatarColor(c.name);

  const planLine = [
    PLAN_LABELS[c.planType] || "ניסיון",
    c.planPrice > 0 ? `₪${c.planPrice}/חודש` : null,
    c.nextBillingDate ? `חיוב: ${new Date(c.nextBillingDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl ${col} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>{c.name.charAt(0).toUpperCase()}</div>
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-2 justify-end flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${bs.cls}`}>{bs.label}</span>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${WA_BADGE[c.waStatus] || WA_BADGE.disconnected}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ws.dot}`} />
                {ws.text}
              </span>
              <h1 className="text-xl font-bold text-slate-900 truncate">{c.name}</h1>
            </div>
            {planLine && <p className="text-sm text-slate-500 mt-0.5">{planLine}</p>}
            <p className="text-xs text-slate-400 font-mono mt-0.5">{c.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 justify-end flex-wrap">
          {(c.waStatus === "waiting_qr" || c.waStatus === "connecting") && (
            <button onClick={onQR} disabled={qrLoading} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              {qrLoading ? "מחכה ל-QR..." : "הצג QR"}
            </button>
          )}
          {c.waStatus === "disconnected" && (
            <button onClick={onReconnect} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              חבר מחדש
            </button>
          )}

          <button onClick={onEdit} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            ערוך
          </button>

          <button onClick={onDelete} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 px-3.5 py-2 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            מחק
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 flex-shrink-0 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab.key ? "border-purple-500 text-purple-600" : `border-transparent hover:text-slate-700 hover:border-slate-300 ${tab.key === "security" ? "text-red-400" : "text-slate-500"}`
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "info" && <TabInfo client={c} onSaved={onSaved} />}
        {activeTab === "groups" && <TabGroups client={c} onSaved={onSaved} />}
        {activeTab === "rules" && <TabRules client={c} />}
        {activeTab === "activity" && <TabActivity client={c} />}
        {activeTab === "security" && <TabSecurity client={c} onSaved={onSaved} />}
      </div>
    </div>
  );
}
