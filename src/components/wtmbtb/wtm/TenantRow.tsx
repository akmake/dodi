// Port of Whatsapp/client/src/components/dashboard/TenantRow.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
const WA_STATUS: Record<string, { text: string; dot: string; badge: string }> = {
  connected: { text: "מחובר", dot: "bg-[#25D366]", badge: "bg-[#dcf8c6] text-[#075E54] ring-[#25D366]/30" },
  connecting: { text: "מתחבר...", dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
  waiting_qr: { text: "ממתין לסריקה", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 ring-blue-200" },
  disconnected: { text: "מנותק", dot: "bg-red-500", badge: "bg-red-50 text-red-700 ring-red-200" },
};

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const elapsed = (iso: string | null) => {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}ש'`;
  if (secs < 3600) return `${Math.floor(secs / 60)}ד'`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}ש"ע`;
  return `${Math.floor(secs / 86400)} ימים`;
};

export default function TenantRow({ t }: { t: any }) {
  const waS = WA_STATUS[t.wa.status] || WA_STATUS.disconnected;
  return (
    <tr className={`hover:bg-[#f5f6f6] transition ${t.wa.status === "disconnected" ? "bg-red-50/40" : ""}`}>
      <td className="px-4 py-3 font-semibold text-[#111b21]">{t.name}</td>
      <td className="px-4 py-3 text-[#8696a0] font-mono text-xs">{t.phone}</td>
      <td className="px-4 py-3 text-xs">
        {t.bridgeEmail ? <span className="text-[#54656f]">{t.bridgeEmail}</span> : <span className="text-orange-500 font-medium">לא מוגדר</span>}
      </td>
      <td className="px-4 py-3 text-xs">
        {t.destinationEmail ? <span className="text-[#54656f]">{t.destinationEmail}</span> : <span className="text-orange-500 font-medium">לא מוגדר</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${waS.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${waS.dot} ${t.wa.status === "connected" ? "animate-pulse" : ""}`} />
          {waS.text}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {t.bridge.active ? (
          <span className="text-xs font-medium text-[#075E54] bg-[#dcf8c6] px-2 py-0.5 rounded-full ring-1 ring-[#25D366]/30">פעיל</span>
        ) : (
          <span className="text-xs text-[#8696a0] bg-[#f0f2f5] px-2 py-0.5 rounded-full ring-1 ring-[#d1d7db]">כבוי</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-mono font-bold text-purple-600">{t.bridge.waToEmail}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-mono font-bold text-cyan-600">{t.bridge.emailToWa}</span>
      </td>
      <td className="px-4 py-3 text-xs text-[#54656f] whitespace-nowrap">
        {t.wa.lastMsgAt ? (
          <span className="flex items-center gap-1">
            <span>{elapsed(t.wa.lastMsgAt)}</span>
            <span className="text-[#d1d7db]">·</span>
            <span className="text-[#8696a0]">{t.wa.lastMsgDirection === "wa_in" ? "⬇" : "⬆"}</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-xs text-[#54656f] whitespace-nowrap">{fmt(t.wa.connectedAt)}</td>
      <td className="px-4 py-3 text-center">
        <span className={`text-xs font-mono font-bold ${t.wa.reconnectCount > 3 ? "text-red-500" : "text-[#8696a0]"}`}>{t.wa.reconnectCount}</span>
      </td>
    </tr>
  );
}
