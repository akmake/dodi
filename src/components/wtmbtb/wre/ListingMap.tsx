"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Import from `phone` (dependency-free), never from `extractor` — that one pulls
// in the AI provider + wa-engine logger + Mongo, none of which can exist in a bundle.
import { toWaMe } from "@/modules/wre/phone";

/** Rough centre of Israel — the view before anything is mapped. */
const IL_CENTER: [number, number] = [31.6, 34.9];

const money = (n: number | null) =>
  n === null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")} מ׳ ₪` : `${n.toLocaleString("he-IL")} ₪`;

const DEAL_LABEL: Record<string, string> = { sale: "למכירה", rent: "להשכרה", roommate: "שותפים", unknown: "לא ידוע" };

const REVIEW_LABEL: Record<string, string> = {
  no_address: "אין רחוב בהודעה",
  no_city: "אין עיר",
  no_house_number: "אין מספר בית — הסיכה על הרחוב בלבד",
  geocode_miss: "הכתובת לא נמצאה",
  low_score: "התאמה חלשה — ודא",
  geocode_error: "שגיאת גיאוקודינג",
};

const APPROX_HOUSE_NUMBER_NOTE = "מספר הבית לא צוין בהודעה — הסיכה על בית כלשהו באותו רחוב, לא בהכרח הנכון";

/**
 * Marker built as a `divIcon` rather than Leaflet's default image marker:
 * the default icons resolve their PNGs by relative URL and break under the
 * bundler, and a div lets the pin carry its own status colour.
 */
function pinIcon(color: string, pulse: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      background:${color};border:2px solid #fff;
      transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4);
      ${pulse ? "animation:wre-pulse 1.6s ease-out infinite;" : ""}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18],
  });
}

const MAPPED_ICON = () => pinIcon("#10b981", false);
const REVIEW_ICON = () => pinIcon("#f59e0b", true);
const MANUAL_ICON = () => pinIcon("#3b82f6", false);
/** Mapped, but the house number is a "1" placeholder — see `WreListing.houseNumberApprox`. */
const APPROX_ICON = () => pinIcon("#8b5cf6", false);

/** Refit the viewport whenever the set of visible pins changes. */
function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const prev = useRef("");
  const key = points.map((p) => p.join(",")).join("|");
  if (key !== prev.current) {
    prev.current = key;
    if (points.length === 1) map.setView(points[0], 16);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }
  return null;
}

export interface MapListing {
  _id: string;
  lat: number | null;
  lng: number | null;
  status: string;
  manualPin: boolean;
  reviewReason: string | null;
  houseNumberApprox: boolean;
  city: string;
  street: string;
  houseNumber: string;
  neighborhood: string;
  rooms: number | null;
  floor: number | null;
  price: number | null;
  sizeSqm: number | null;
  dealType: string;
  features: string[];
  rawText: string;
  groupName: string;
  senderName: string;
  contactPhone: string;
  geocodeMatch: string | null;
  geocodeScore: number | null;
  repostCount: number;
  messageAt: string;
}

export default function ListingMap({
  listings,
  onMovePin,
}: {
  listings: MapListing[];
  onMovePin: (id: string, lat: number, lng: number) => void;
}) {
  const pinned = useMemo(() => listings.filter((l) => l.lat !== null && l.lng !== null), [listings]);
  const points = useMemo(() => pinned.map((l) => [l.lat as number, l.lng as number] as [number, number]), [pinned]);

  return (
    <>
      <style>{`@keyframes wre-pulse{0%{box-shadow:0 0 0 0 rgba(245,158,11,.7)}70%{box-shadow:0 0 0 10px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}`}</style>
      <MapContainer center={IL_CENTER} zoom={8} className="h-full w-full" style={{ background: "#e5e7eb" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <FitBounds points={points} />

        {pinned.map((l) => {
          const review = l.status === "needs_review";
          const icon = l.manualPin ? MANUAL_ICON() : review ? REVIEW_ICON() : l.houseNumberApprox ? APPROX_ICON() : MAPPED_ICON();
          return (
            <Marker
              key={l._id}
              position={[l.lat as number, l.lng as number]}
              icon={icon}
              // Only unverified pins are draggable — a confirmed pin should not
              // be moved by an accidental drag. An approx house number is also
              // unverified: the pin sits on *a* building on the right street.
              draggable={review || l.manualPin || l.houseNumberApprox}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  onMovePin(l._id, lat, lng);
                },
              }}
            >
              <Popup maxWidth={320} minWidth={260}>
                <div dir="rtl" style={{ fontFamily: "inherit" }} className="text-right">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${l.dealType === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                      {DEAL_LABEL[l.dealType] ?? l.dealType}
                    </span>
                    <strong className="text-sm text-slate-800">
                      {l.street} {l.houseNumber}
                      {l.houseNumberApprox && <span className="text-violet-600 font-normal">*</span>}, {l.city}
                    </strong>
                  </div>

                  {l.neighborhood && <p className="text-[11px] text-slate-400 mb-1">שכונה: {l.neighborhood}</p>}

                  <p className="text-sm font-bold text-emerald-700 mb-1">{money(l.price)}</p>
                  <p className="text-xs text-slate-600 mb-2">
                    {l.rooms !== null && <>{l.rooms} חד&apos;</>}
                    {l.floor !== null && <> · קומה {l.floor}</>}
                    {l.sizeSqm !== null && <> · {l.sizeSqm} מ&quot;ר</>}
                  </p>

                  {l.features.length > 0 && (
                    <p className="text-[11px] text-slate-500 mb-2">{l.features.join(" · ")}</p>
                  )}

                  {review && (
                    <p className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-2 py-1 mb-2">
                      ⚠ {REVIEW_LABEL[l.reviewReason ?? ""] ?? "דרוש אימות"} — גרור את הסיכה למקום הנכון
                    </p>
                  )}
                  {l.manualPin && <p className="text-[11px] text-blue-600 mb-2">📍 מיקום נקבע ידנית</p>}
                  {!review && !l.manualPin && l.houseNumberApprox && (
                    <p className="text-[11px] bg-violet-50 text-violet-800 border border-violet-200 rounded px-2 py-1 mb-2">
                      ⚠ {APPROX_HOUSE_NUMBER_NOTE} — גרור את הסיכה אם צריך
                    </p>
                  )}
                  {!review && !l.manualPin && !l.houseNumberApprox && l.geocodeMatch && (
                    <p className="text-[11px] text-slate-400 mb-2">התאמה: {l.geocodeMatch}</p>
                  )}

                  <details className="mb-1">
                    <summary className="text-[11px] text-slate-500 cursor-pointer">ההודעה המקורית</summary>
                    <p className="text-[11px] text-slate-600 whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto bg-slate-50 rounded p-2">{l.rawText}</p>
                  </details>

                  <div className="text-[10px] text-slate-400 border-t pt-1 mt-1">
                    {l.groupName} · {l.senderName}
                    {l.repostCount > 0 && <> · פורסם שוב ×{l.repostCount}</>}
                  </div>

                  {l.contactPhone && (
                    // wa.me needs the international form — `wa.me/0501234567` resolves to nothing.
                    <a href={`https://wa.me/${toWaMe(l.contactPhone)}`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg no-underline">
                      וואטסאפ למפרסם · {l.contactPhone}
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </>
  );
}
