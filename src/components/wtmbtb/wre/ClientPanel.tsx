"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { WA_STATUS } from "@/components/wtmbtb/ui/constants";
import { wreApi } from "@/lib/wtmbtb/api";
import TabMessages from "./tabs/TabMessages";
import TabMap from "./tabs/TabMap";
import TabGroups from "./tabs/TabGroups";
import TabCapture from "./tabs/TabCapture";

// Everything about a broker lives here, in his own tabs — you never leave a
// broker to see his own messages or his own map.
const TABS = [
  { key: "messages", label: "הודעות" },
  { key: "map", label: "מפה" },
  { key: "groups", label: "קבוצות" },
  { key: "capture", label: "איסוף" },
];

export default function ClientPanel({
  client,
  onQR,
  onReconnect,
  onDelete,
  onSaved,
}: {
  client: any;
  onQR: () => void;
  onReconnect: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("messages");
  const ws = WA_STATUS[client.waStatus] || WA_STATUS.disconnected;
  const connected = client.waStatus === "connected";
  const watched = (client.watchedGroups ?? []).filter((g: any) => g.enabled).length;

  const toggleActive = async () => {
    await wreApi.put(`/clients/${client._id}`, { action: "active", active: !client.active });
    onSaved();
  };

  return (
    <div className="flex flex-col h-full" style={{ direction: "rtl" }}>
      <header className="bg-white border-b border-slate-200 px-5 py-3 flex-shrink-0 flex items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800 truncate">{client.name}</h2>
            {!client.active && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">מושהה</span>}
          </div>
          <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ws.dot}`} />
              {ws.text}
            </span>
            <span>·</span>
            <span>{client.phone}</span>
            <span>·</span>
            <span>{watched} קבוצות</span>
          </div>
        </div>

        {/* Connect is the one action that matters when disconnected — nothing works without it. */}
        {!connected && (
          <button onClick={onQR} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg transition font-medium flex-shrink-0">
            חבר וואטסאפ (QR)
          </button>
        )}

        <div className="flex items-center gap-1.5 mr-auto flex-shrink-0">
          <button onClick={onReconnect} className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 transition">
            חבר מחדש
          </button>
          <button onClick={toggleActive} className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 transition">
            {client.active ? "השהה" : "הפעל"}
          </button>
          <button onClick={onDelete} className="text-[11px] text-slate-400 hover:text-red-600 px-2 py-1 transition">
            מחק
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200 px-5 flex gap-1 flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-4 py-2.5 border-b-2 transition ${tab === t.key ? "border-emerald-600 text-emerald-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* The map fills its area and must not scroll; the others do. */}
      <div className={`flex-1 min-h-0 ${tab === "map" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {tab === "messages" && <TabMessages client={client} />}
        {tab === "map" && <TabMap client={client} />}
        {tab === "groups" && <TabGroups client={client} onSaved={onSaved} />}
        {tab === "capture" && <TabCapture client={client} onSaved={onSaved} />}
      </div>
    </div>
  );
}
