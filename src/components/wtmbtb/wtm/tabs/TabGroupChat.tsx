"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabGroupChat.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "היום";
  if (d.toDateString() === yesterday.toDateString()) return "אתמול";
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const SENDER_COLORS = ["#e17055", "#6c5ce7", "#00b894", "#0984e3", "#d63031", "#fd79a8", "#00cec9", "#e67e22"];
function senderColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

function MessageBubble({ msg, showSender, prevMsg }: { msg: any; showSender: boolean; prevMsg: any }) {
  const isOut = msg.direction === "out";
  const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

  return (
    <>
      {showDate && (
        <div className="flex justify-center my-3">
          <span className="bg-white/80 text-slate-500 text-xs px-3 py-1 rounded-full shadow-sm">{formatDateDivider(msg.createdAt)}</span>
        </div>
      )}
      <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`relative max-w-[72%] rounded-2xl px-3 pt-1.5 pb-2 shadow-sm ${isOut ? "bg-[#dcf8c6] rounded-tr-sm" : "bg-white rounded-tl-sm"}`}>
          {!isOut && showSender && msg.senderName && (
            <p className="text-xs font-semibold mb-0.5" style={{ color: senderColor(msg.senderName) }}>
              {msg.senderName}
            </p>
          )}
          {msg.mediaType && (
            <div className="mb-1 rounded-lg overflow-hidden bg-slate-100 flex items-center gap-2 px-2 py-2 text-slate-500 text-xs">
              {msg.mediaType === "image" && <span>🖼️</span>}
              {msg.mediaType === "video" && <span>🎬</span>}
              {msg.mediaType === "audio" && <span>🎵</span>}
              {msg.mediaType === "document" && <span>📄</span>}
              <span>{msg.mediaType}</span>
            </div>
          )}
          {msg.text && <p className="text-sm text-slate-800 leading-snug whitespace-pre-wrap break-words">{msg.text}</p>}
          <div className={`flex items-center gap-1 mt-0.5 justify-end`}>
            <span className="text-[10px] text-slate-400 leading-none">{formatTime(msg.createdAt)}</span>
            {isOut && <span className="text-[10px] text-[#53bdeb] leading-none">✓✓</span>}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ hasGroups }: { hasGroups: boolean }) {
  if (!hasGroups) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="text-5xl mb-4">👥</div>
        <p className="text-white/90 font-medium text-lg">אין קבוצות מורשות</p>
        <p className="text-white/60 text-sm mt-2">לך לטאב &quot;קבוצות&quot; כדי להוסיף קבוצות לניטור</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="text-5xl mb-4">💬</div>
      <p className="text-white/90 font-medium text-lg">בחר קבוצה</p>
      <p className="text-white/60 text-sm mt-2">בחר קבוצה מהרשימה כדי לצפות בשיחה</p>
    </div>
  );
}

function ResetSessionDialog({ tenantName, onConfirm, onCancel, loading }: { tenantName: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 text-right">
        <div className="text-3xl mb-3 text-center">⚠️</div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">איפוס סשן WhatsApp</h2>
        <p className="text-sm text-slate-600 mb-1">
          פעולה זו תמחק את הסשן הנוכחי של <strong>{tenantName}</strong>.
        </p>
        <p className="text-sm text-slate-600 mb-4">המשתמש יצטרך לסרוק QR חדש כדי להתחבר מחדש. הודעות שהתקבלו עד כה יישמרו; מהחיבור החדש ואילך ייקלטו רק הודעות חדשות.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg transition disabled:opacity-40">
            ביטול
          </button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-50 flex items-center gap-2">
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {loading ? "מאפס..." : "אפס סשן"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TabGroupChat({ tenant, onResetSession }: { tenant: any; onResetSession?: () => void }) {
  const groups = tenant.allowedGroups ?? [];
  const [selected, setSelected] = useState<any>(groups[0] ?? null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevGroupRef = useRef<string | null>(null);

  const fetchMessages = async (group: any) => {
    if (!group) return;
    setLoading(true);
    try {
      const res = await wtmApi.get<any[]>(`/clients/${tenant._id}/messages`, { params: { groupJid: group.groupId, limit: 150 } });
      setMessages(res.data);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selected) return;
    if (prevGroupRef.current !== selected.groupId) {
      prevGroupRef.current = selected.groupId;
      fetchMessages(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleReset = async () => {
    setResetLoading(true);
    try {
      await wtmApi.post(`/clients/${tenant._id}/reset-session`);
      setShowReset(false);
      if (onResetSession) onResetSession();
    } finally {
      setResetLoading(false);
    }
  };

  useSSE(() => {
    if (selected) fetchMessages(selected);
  }, 800);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      {showReset && <ResetSessionDialog tenantName={tenant.name} onConfirm={handleReset} onCancel={() => setShowReset(false)} loading={resetLoading} />}
      <div className="flex h-full" style={{ background: "#111b21" }}>
        <div className="w-64 flex-shrink-0 border-r border-white/10 flex flex-col" style={{ background: "#202c33" }}>
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white font-semibold text-sm">קבוצות מנוטרות</p>
            <p className="text-white/40 text-xs mt-0.5">{groups.length} קבוצות</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups.length === 0 && <p className="text-white/40 text-xs text-center mt-8 px-4">אין קבוצות. הגדר בטאב &quot;קבוצות&quot;.</p>}
            {groups.map((g: any) => {
              const active = selected?.groupId === g.groupId;
              return (
                <button key={g.groupId} onClick={() => setSelected(g)} className={`w-full text-right px-4 py-3 flex items-center gap-3 transition ${active ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {g.groupName?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-white text-sm font-medium truncate">{g.groupName}</p>
                    <p className="text-white/40 text-xs truncate">{g.groupId}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!selected && <EmptyState hasGroups={groups.length > 0} />}

          {selected && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0" style={{ background: "#202c33" }}>
                <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{selected.groupName?.charAt(0)?.toUpperCase() ?? "?"}</div>
                <div className="text-right">
                  <p className="text-white font-semibold text-sm">{selected.groupName}</p>
                  <p className="text-white/40 text-xs">{messages.length} הודעות</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <button onClick={() => fetchMessages(selected)} className="text-white/50 hover:text-white/90 transition text-xs flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    רענן
                  </button>
                  <button onClick={() => setShowReset(true)} title="איפוס סשן — מחיקת החיבור וסריקת QR חדש" className="text-amber-400/70 hover:text-amber-300 transition text-xs flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    אפס סשן
                  </button>
                </div>
              </div>

              <div
                className="flex-1 overflow-y-auto px-4 py-3"
                style={{
                  background: "#0b141a",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Ccircle cx='20' cy='20' r='1' fill='%23ffffff08'/%3E%3Ccircle cx='60' cy='60' r='1' fill='%23ffffff08'/%3E%3C/svg%3E")`,
                }}
              >
                {loading && (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                  </div>
                )}
                {!loading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-white/40 text-sm">אין הודעות בקבוצה זו עדיין</p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const prev = i > 0 ? messages[i - 1] : null;
                  const showSender = !prev || prev.phone !== msg.phone || prev.direction !== msg.direction;
                  return <MessageBubble key={msg._id} msg={msg} showSender={showSender} prevMsg={prev} />;
                })}
                <div ref={bottomRef} />
              </div>

              <div className="flex-shrink-0 px-4 py-2 flex items-center gap-3" style={{ background: "#202c33" }}>
                <div className="flex-1 bg-white/10 rounded-full px-4 py-2 text-white/30 text-sm text-right cursor-not-allowed select-none">מצב צפייה בלבד...</div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
