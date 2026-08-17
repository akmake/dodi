/**
 * Geocoding provider seam for WRE (same shape as `TelephonyAdapter` in [26]).
 *
 * Google is primary when `GOOGLE_GEOCODING_API_KEY` is set (documented, stable
 * API); govmap (no key required) is the fallback, and the sole provider when
 * no Google key is configured — see `geo/index.ts` for the ordering. Nominatim/
 * OSM was evaluated and deliberately rejected: on
 * Hebrew queries it resolved "רוטשילד 12, תל אביב, ישראל" to *Aveyron, France*
 * (it matched "12" to the French department) and "ויצמן 13 קרית מלאכי" to a
 * highway in the Arava. A fallback that silently returns a confident wrong
 * country is worse for a broker than returning nothing.
 */
import { config } from "@/core/config";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Provider-native match score. govmap: ~4,200+ exact, ~1,300 street-only, ~250 noise. */
  score: number;
  /** The address string the provider matched — surfaced in the UI so a human can spot a mis-geocode. */
  matchedText: string;
  provider: string;
}

export interface GeocodeProvider {
  readonly name: string;
  /** Resolve a "<street> <number> <city>" query. Returns null when nothing matched. */
  lookup(query: string, signal?: AbortSignal): Promise<GeocodeResult | null>;
}

// ─── projection ──────────────────────────────────────────────────────────────

/** Spherical Web Mercator radius (EPSG:3857). */
const R = 6378137;

/**
 * EPSG:3857 → WGS84. govmap returns `shape: "POINT(x y)"` in Web Mercator, not
 * lat/lng. Verified against known points: Dizengoff/Tel Aviv → 32.07,34.78 and
 * Dizengoff/Netanya → 32.33,34.86, both correct.
 */
export function mercatorToWgs84(x: number, y: number): { lat: number; lng: number } {
  return {
    lat: (Math.atan(Math.exp(y / R)) * 360) / Math.PI - 90,
    lng: (x / R) * (180 / Math.PI),
  };
}

/** Rough bounding box of Israel — guards against a provider handing back a wild point. */
const IL_BOUNDS = { minLat: 29.4, maxLat: 33.4, minLng: 34.2, maxLng: 35.9 };

export const inIsrael = (lat: number, lng: number) =>
  lat >= IL_BOUNDS.minLat && lat <= IL_BOUNDS.maxLat && lng >= IL_BOUNDS.minLng && lng <= IL_BOUNDS.maxLng;

// ─── govmap ──────────────────────────────────────────────────────────────────

const GOVMAP_URL = "https://www.govmap.gov.il/api/search-service/autocomplete";

interface GovmapResult {
  id?: string;
  text?: string;
  type?: string;
  score?: number;
  shape?: string;
  originalText?: string;
}

/** Parse the leading coordinate pair out of `POINT(x y)` / `MULTIPOINT (x y, …)`. */
function parseShape(shape: string): { x: number; y: number } | null {
  const m = shape?.match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const [x, y] = m[0].split(/\s+/).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export const govmapProvider: GeocodeProvider = {
  name: "govmap",

  async lookup(query, signal) {
    if (!query.trim()) return null;

    const res = await fetch(GOVMAP_URL, {
      method: "POST",
      headers: {
        // charset matters: the payload is Hebrew.
        "Content-Type": "application/json; charset=utf-8",
        // The endpoint is the public site's own; a browser-ish UA avoids being filtered.
        "User-Agent": "Mozilla/5.0 (compatible; bootWhat-WRE/1.0)",
      },
      // `filterType: "address"` is required. Without it the index happily ranks bus
      // routes and land parcels that merely contain the house number above the
      // actual address. The name is not guessable — it comes from the site bundle's
      // own request schema.
      body: JSON.stringify({
        searchText: query,
        language: "he",
        filterType: "address",
        isAccurate: false,
        maxResults: 5,
      }),
      signal,
    });

    if (!res.ok) throw new Error(`govmap ${res.status}`);

    const json = (await res.json()) as { results?: GovmapResult[] };
    const top = (json.results ?? []).find((r) => r.type === "address" && r.shape);
    if (!top?.shape) return null;

    const pt = parseShape(top.shape);
    if (!pt) return null;

    const { lat, lng } = mercatorToWgs84(pt.x, pt.y);
    if (!inIsrael(lat, lng)) return null;

    return {
      lat,
      lng,
      score: top.score ?? 0,
      // `originalText` carries the unabbreviated address ("דיזנגוף 1 תל אביב-יפו")
      // where `text` abbreviates the city (`ת"א`); prefer the readable one.
      matchedText: top.originalText || top.text || "",
      provider: "govmap",
    };
  },
};

// ─── google (fallback) ────────────────────────────────────────────────────────

const GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Google has no govmap-style match score, so `location_type` is translated onto
 * govmap's scale (`SCORE_STRONG`/`SCORE_FLOOR` in geo/index.ts) so the same
 * verification logic applies to both providers unchanged: ROOFTOP/
 * RANGE_INTERPOLATED pin an exact house number and read as "strong", the way
 * govmap's ~4,200+ exact matches do; GEOMETRIC_CENTER/APPROXIMATE only resolve
 * a general area and read as "street-only", the way govmap's ~1,360 does.
 */
const GOOGLE_LOCATION_TYPE_SCORE: Record<string, number> = {
  ROOFTOP: 4500,
  RANGE_INTERPOLATED: 4200,
  GEOMETRIC_CENTER: 1360,
  APPROXIMATE: 250,
};

interface GoogleGeocodeResult {
  formatted_address?: string;
  partial_match?: boolean;
  geometry?: { location?: { lat: number; lng: number }; location_type?: string };
}

interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
}

export const googleProvider: GeocodeProvider = {
  name: "google",

  async lookup(query, signal) {
    if (!query.trim()) return null;
    const apiKey = config.geocoding.googleApiKey;
    if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY not configured");

    const url = new URL(GOOGLE_URL);
    url.searchParams.set("address", query);
    // Biases results toward Israel without hard-restricting them, so a
    // malformed query still gets Google's best guess rather than nothing.
    url.searchParams.set("region", "il");
    url.searchParams.set("language", "he");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`google geocode ${res.status}`);

    const json = (await res.json()) as GoogleGeocodeResponse;

    if (json.status === "ZERO_RESULTS") return null;
    // Anything else (REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST,
    // UNKNOWN_ERROR) is an infra/auth problem, not "no match" — throw so it
    // surfaces in logs instead of being cached as a silent permanent miss.
    if (json.status !== "OK") throw new Error(`google geocode status ${json.status}`);

    const top = json.results?.[0];
    const loc = top?.geometry?.location;
    if (!top || !loc) return null;
    if (!inIsrael(loc.lat, loc.lng)) return null;

    const locationType = top.geometry?.location_type ?? "APPROXIMATE";
    let score = GOOGLE_LOCATION_TYPE_SCORE[locationType] ?? 250;
    // A partial match means Google substituted the nearest thing it had for
    // what we actually asked for — the same failure mode as govmap's
    // street-only hits, so it must not read as a confident match.
    if (top.partial_match) score = Math.min(score, 1360);

    return {
      lat: loc.lat,
      lng: loc.lng,
      score,
      matchedText: top.formatted_address || "",
      provider: "google",
    };
  },
};
