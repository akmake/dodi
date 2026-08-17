"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { wreApi } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import type { MapListing } from "@/components/wtmbtb/wre/ListingMap";

// Leaflet touches `window` at import time, so it can never be server-rendered.
const ListingMap = dynamic(() => import("@/components/wtmbtb/wre/ListingMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-slate-100 text-sm text-slate-400">טוען מפה...</div>,
});

const DEALS = [
  { key: "", label: "הכל" },
  { key: "sale", label: "למכירה" },
  { key: "rent", label: "להשכרה" },
];

const DAYS = [
  { key: "1", label: "היום" },
  { key: "7", label: "שבוע" },
  { key: "30", label: "חודש" },
  { key: "", label: "הכל" },
];

/**
 * One broker's map. Lives inside the broker (a tab), not on a separate page with
 * its own client picker — you should never have to leave a broker to see his own
 * apartments.
 */
export default function TabMap({ client }: { client: any }) {
  const clientId = client._id as string;
  const [listings, setListings] = useState<MapListing[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [city, setCity] = useState("");
  const [dealType, setDealType] = useState("");
  const [days, setDays] = useState("");

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | string[]> = {
        status: ["mapped", "needs_review"],
        limit: "500",
      };
      if (city) params.city = city;
      if (dealType) params.dealType = dealType;
      if (days) params.days = days;
      const res = await wreApi.get<any>(`/clients/${clientId}/listings`, { params });
      setListings(res.data.listings ?? []);
      setCities(res.data.cities ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId, city, dealType, days]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);
  useSSE(fetchListings);

  const movePin = async (id: string, lat: number, lng: number) => {
    // Optimistic: the pin is already where the broker dropped it.
    setListings((ls) => ls.map((l) => (l._id === id ? { ...l, lat, lng, status: "mapped", manualPin: true, reviewReason: null } : l)));
    try {
      await wreApi.put(`/clients/${clientId}/listings/${id}`, { action: "pin", lat, lng });
    } catch (e) {
      console.error(e);
      fetchListings(); // resync on failure
    }
  };

  const pinned = listings.filter((l) => l.lat !== null && l.lng !== null).length;
  const unpinned = listings.length - pinned;

  return (
    <div className="h-full flex flex-col" style={{ direction: "rtl" }}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white flex-shrink-0 flex-wrap">
        <select value={city} onChange={(e) => setCity(e.target.value)} className="input-base w-36 py-1 text-xs">
          <option value="">כל הערים</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {DEALS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDealType(d.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition ${dealType === d.key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDays(d.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition ${days === d.key ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mr-auto text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> מדויק
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> משוער · גרור
          </span>
          <span>{loading ? "טוען..." : `${pinned} על המפה`}</span>
        </div>
      </div>

      <div className="flex-1 relative min-h-0" style={{ direction: "ltr" }}>
        <ListingMap listings={listings} onMovePin={movePin} />
        {/* An empty map is indistinguishable from a broken one. Name the reason. */}
        {!loading && pinned === 0 && (
          <div className="absolute inset-x-0 top-3 z-[500] flex justify-center pointer-events-none" style={{ direction: "rtl" }}>
            <div className="bg-white/95 border border-slate-200 shadow-lg rounded-xl px-4 py-2.5 max-w-sm text-center">
              <p className="text-sm font-semibold text-slate-700 mb-0.5">אין סיכות להצגה</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {unpinned > 0
                  ? `${unpinned} דירות ללא מיקום — פתח "הודעות" ולחץ "תקן כתובת".`
                  : "עדיין לא נקלטו דירות עם כתובת."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
