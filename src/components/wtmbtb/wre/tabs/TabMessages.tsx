"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { wreApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import EditAddressModal from "@/components/wtmbtb/wre/modals/EditAddressModal";
// Import from `phone` (dependency-free), never from `extractor` — that one pulls
// in the AI provider + wa-engine logger + Mongo, none of which can exist in a bundle.
import { toWaMe } from "@/modules/wre/phone";

const money = (n: number | null) =>
  n === null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")} מ׳ ₪` : `${n.toLocaleString("he-IL")} ₪`;

const DEAL_LABEL: Record<string, string> = { sale: "למכירה", rent: "להשכרה", roommate: "שותפים", unknown: "—" };

/** Every message gets one of these. `mapped` is the broker's "טופל". */
const STATUS_BADGE: Record<string, { label: string; cls: string; hint: string }> = {
  mapped: { label: "טופל · במפה", cls: "bg-emerald-100 text-emerald-700", hint: "חולצו הערכים והדירה הוצבה על המפה" },
  needs_review: { label: "דרוש אימות", cls: "bg-amber-100 text-amber-700", hint: "זוהתה דירה, אבל הכתובת לא אומתה — גרור סיכה במפה" },
  low_confidence: { label: "ביטחון נמוך", cls: "bg-orange-100 text-orange-700", hint: "נקרא כדירה אך מתחת לסף — בדוק ידנית" },
  not_listing: { label: "לא דירה", cls: "bg-slate-100 text-slate-500", hint: "לא הצעת דירה (פטפוט או בקשת חיפוש)" },
  duplicate: { label: "כפילות", cls: "bg-violet-100 text-violet-600", hint: "אותה דירה כבר נקלטה" },
  rejected: { label: "נדחה", cls: "bg-red-50 text-red-600", hint: "סומן ידנית כלא רלוונטי" },
  skipped: { label: "לא נסרק", cls: "bg-slate-50 text-slate-400", hint: "קצר מדי — לא נשלח ל-AI" },
};

const FILTERS = [
  { key: "", label: "הכל" },
  { key: "mapped", label: "טופל" },
  { key: "needs_review", label: "דרוש אימות" },
  { key: "low_confidence", label: "ביטחון נמוך" },
  { key: "not_listing", label: "לא דירה" },
  { key: "duplicate", label: "כפילות" },
  { key: "skipped", label: "לא נסרק" },
];

const time = (d: string) =>
  new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * One broker's message feed — every message from the groups *this* client
 * watches, with what the extractor made of each. Scoped by `client._id`; there
 * is deliberately no client picker here, because a broker's messages belong to
 * the broker, not to a shared screen.
 */
export default function TabMessages({ client }: { client: any }) {
  const clientId = client._id as string;
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | string[]> = { limit: "300" };
      if (status) params.status = [status];
      if (search.trim()) params.search = search.trim();
      const res = await wreApi.get<any>(`/clients/${clientId}/listings`, { params });
      setRows(res.data.listings ?? []);
      setTotal(res.data.total ?? 0);
      setByStatus(res.data.byStatus ?? {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId, status, search]);

  useEffect(() => {
    const t = setTimeout(fetchRows, search ? 350 : 0); // debounce typing
    return () => clearTimeout(t);
  }, [fetchRows, search]);
  useSSE(fetchRows);

  const setStatusOf = async (id: string, next: string) => {
    await wreApi.put(`/clients/${clientId}/listings/${id}`, { action: "status", status: next });
    fetchRows();
  };


  const remove = async (id: string) => {
    if (!confirm("למחוק את ההודעה הזו?")) return;
    await wreApi.del(`/clients/${clientId}/listings/${id}`);
    fetchRows();
  };

  const grandTotal = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const mappedPct = grandTotal ? Math.round(((byStatus.mapped ?? 0) / grandTotal) * 100) : 0;
  const watched = (client.watchedGroups ?? []).filter((g: any) => g.enabled).length;

  return (
    <div className="p-4 space-y-3" style={{ direction: "rtl" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש בהודעה, רחוב, עיר..."
          className="input-base w-64 py-1.5 text-xs"
        />

        {/* Filters sit next to the search, not on their own row — one control strip. */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => {
            const count = f.key ? byStatus[f.key] : grandTotal;
            if (f.key && !count) return null; // don't offer a filter that matches nothing
            return (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                title={STATUS_BADGE[f.key]?.hint}
                className={`text-[11px] px-2.5 py-1 rounded-full transition ${status === f.key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {f.label}
                <span className="mr-1 opacity-70">({count ?? 0})</span>
              </button>
            );
          })}
        </div>

        <span className="text-[11px] text-slate-400 mr-auto whitespace-nowrap">
          {loading ? "טוען..." : `${total} הודעות`}
          {grandTotal > 0 && <span className={`mr-2 font-medium ${mappedPct === 0 ? "text-slate-400" : "text-emerald-600"}`}>{mappedPct}% על המפה</span>}
        </span>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm text-slate-400">
            {client.waStatus !== "connected"
              ? "הבוט של המתווך הזה לא מחובר — חבר אותו (QR) כדי להתחיל לקלוט."
              : watched === 0
                ? 'אין קבוצות באיסוף — סמן קבוצות בטאב "קבוצות".'
                : "מחובר ומאזין. עדיין לא נקלטו הודעות מהקבוצות שסימנת."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2.5 w-[36%]">ההודעה</th>
                <th className="text-right font-medium px-2 py-2.5">עיר</th>
                <th className="text-right font-medium px-2 py-2.5">רחוב</th>
                <th className="text-right font-medium px-2 py-2.5">מס&apos;</th>
                <th className="text-right font-medium px-2 py-2.5">חדרים</th>
                <th className="text-right font-medium px-2 py-2.5">מחיר</th>
                <th className="text-right font-medium px-2 py-2.5">סטטוס</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const badge = STATUS_BADGE[l.status] ?? STATUS_BADGE.not_listing;
                const isOpen = open === l._id;
                const dim = ["not_listing", "skipped", "duplicate"].includes(l.status);
                return (
                  <tr key={l._id} className={`border-t border-slate-100 hover:bg-slate-50/60 align-top ${dim ? "opacity-60" : ""}`}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setOpen(isOpen ? null : l._id)} className="text-right w-full group">
                        {/* No `block` here: Tailwind's line-clamp needs display:-webkit-box,
                            and `block` overrides it — which is why the raw text used to
                            swallow the whole table instead of clamping to two lines. */}
                        <span className={`${isOpen ? "block" : "line-clamp-2"} text-slate-700 leading-snug`}>{l.rawText}</span>
                        <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                          <span className="text-emerald-600 opacity-0 group-hover:opacity-100 transition">{isOpen ? "סגור" : "פתח"}</span>
                          <span className="truncate">
                            {l.groupName} · {l.senderName} · {time(l.messageAt)}
                          </span>
                          {l.repostCount > 0 && <span className="text-violet-500 flex-shrink-0">×{l.repostCount + 1}</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 space-y-0.5">
                          <div>
                            ביטחון AI: {Math.round((l.confidence ?? 0) * 100)}%
                            {l.dealType !== "unknown" && <> · {DEAL_LABEL[l.dealType]}</>}
                            {l.floor !== null && <> · קומה {l.floor}</>}
                            {l.sizeSqm !== null && <> · {l.sizeSqm} מ&quot;ר</>}
                          </div>
                          {l.neighborhood && <div>שכונה: {l.neighborhood}</div>}
                          {l.features?.length > 0 && <div>{l.features.join(" · ")}</div>}
                          {l.geocodeMatch && <div>גיאוקוד: &quot;{l.geocodeMatch}&quot; (ציון {Math.round(l.geocodeScore ?? 0)})</div>}
                          {l.contactPhone && (
                            <div>
                              טלפון בהודעה:{" "}
                              <a href={`https://wa.me/${toWaMe(l.contactPhone)}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                                {l.contactPhone}
                              </a>
                            </div>
                          )}
                          <div className="text-slate-300">{badge.hint}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-slate-700">{l.city || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5 text-slate-700">{l.street || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5 text-slate-700">{l.houseNumber || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5 text-slate-600">{l.rooms ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5 font-medium text-slate-800 whitespace-nowrap">{money(l.price)}</td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`} title={badge.hint}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-left whitespace-nowrap">
                      {["needs_review", "low_confidence"].includes(l.status) && (
                        <button onClick={() => setEditing(l)} className="text-[11px] text-emerald-600 hover:underline transition ml-2">
                          תקן כתובת
                        </button>
                      )}
                      {l.status !== "rejected" && (
                        <button onClick={() => setStatusOf(l._id, "rejected")} className="text-[11px] text-slate-400 hover:text-red-600 transition">
                          דחה
                        </button>
                      )}
                      <button onClick={() => remove(l._id)} className="text-[11px] text-slate-400 hover:text-red-600 transition mr-2">
                        מחק
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditAddressModal
          clientId={clientId}
          listing={editing}
          onClose={() => setEditing(null)}
          onSaved={fetchRows}
        />
      )}
    </div>
  );
}
