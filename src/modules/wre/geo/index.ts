/**
 * WRE geocoding — turns an extracted {city, street, houseNumber} into a map pin,
 * or into an honest "needs review".
 *
 * The guiding rule: for a broker, a pin in the wrong place is worse than no pin,
 * because a wrong pin sends them driving. So a result is only promoted to the
 * map when the provider's match is independently *verified* against what we
 * asked for; anything else lands in the review queue with a draggable pin.
 */
import type { ReviewReason } from "../models";
import { buildQuery, cacheKey, verifyMatch, normalizeHouseNumber } from "./normalize";
import { govmapProvider, googleProvider, type GeocodeProvider, type GeocodeResult } from "./provider";
import { readCache, writeCache } from "../repository";
import { logger } from "@/modules/wa-engine/logger";
import { config } from "@/core/config";

/**
 * Score bands, measured against govmap (see specs/29-wre-real-estate.md):
 *   ~4,200-4,700  exact "<street> <number> <city>"
 *   ~1,360        street name only — right street, arbitrary number/city
 *   ~220-250      noise (matched a digit somewhere)
 * STRONG sits above the street-only band so a street-only hit can never be
 * mistaken for a real address match.
 */
const SCORE_STRONG = 2000;
const SCORE_FLOOR = 800;

/**
 * Google is primary when a key is configured — it has a documented, stable
 * API (unlike govmap, whose undocumented endpoint has proven unreliable —
 * see specs/29-wre-real-estate.md). govmap stays in the chain as a free
 * fallback for whenever Google errors or misses (quota exhaustion, an
 * address it doesn't have) — see `lookupAcrossProviders`. Without a Google
 * key, govmap is the only provider, as before.
 */
const providers: GeocodeProvider[] = config.geocoding.googleApiKey
  ? [googleProvider, govmapProvider]
  : [govmapProvider];

const TIMEOUT_MS = 8000;

export interface GeocodeOutcome {
  lat: number | null;
  lng: number | null;
  score: number | null;
  matchedText: string | null;
  provider: string | null;
  /** null when the pin is trustworthy enough for the map. */
  reviewReason: ReviewReason;
  /** True when there was no house number to go on and "1" was used as a placeholder — see `geocodeAddress`. */
  houseNumberApprox: boolean;
}

const miss = (reason: ReviewReason): GeocodeOutcome => ({
  lat: null,
  lng: null,
  score: null,
  matchedText: null,
  provider: null,
  reviewReason: reason,
  houseNumberApprox: false,
});

/** Stands in for a real house number so a street-only post still geocodes to a real building — never the actual address. */
const PLACEHOLDER_HOUSE_NUMBER = "1";

async function lookupWithTimeout(provider: GeocodeProvider, query: string): Promise<GeocodeResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await provider.lookup(query, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Provider lookup wrapped in the persistent cache (misses are cached too).
 *
 * The cache key is prefixed with the provider name so a cached govmap miss
 * can never shadow a fresh Google attempt for the same address (and vice
 * versa) — each provider gets its own cache line.
 */
async function cachedLookup(provider: GeocodeProvider, query: string): Promise<GeocodeResult | null> {
  const key = `${provider.name}:${cacheKey(query)}`;

  const cached = await readCache(key).catch(() => null);
  if (cached) {
    if (!cached.hit) return null;
    return {
      lat: cached.lat as number,
      lng: cached.lng as number,
      score: cached.score ?? 0,
      matchedText: cached.matchedText ?? "",
      provider: cached.provider,
    };
  }

  const result = await lookupWithTimeout(provider, query);

  await writeCache({
    query: key,
    provider: provider.name,
    lat: result?.lat ?? null,
    lng: result?.lng ?? null,
    score: result?.score ?? null,
    matchedText: result?.matchedText ?? null,
    hit: !!result,
  }).catch(() => {});

  return result;
}

interface ProviderLookupOutcome {
  result: GeocodeResult | null;
  /** True if any provider threw (vs. cleanly reporting no match) — see `geocodeAddress`. */
  hadError: boolean;
}

/**
 * Try each configured provider in order, falling through on error or miss.
 * A single bad provider (govmap's current outage, a Google quota error, …)
 * must not take the whole lookup down — only exhausting every provider does.
 */
async function lookupAcrossProviders(query: string): Promise<ProviderLookupOutcome> {
  let hadError = false;
  for (const provider of providers) {
    try {
      const result = await cachedLookup(provider, query);
      if (result) return { result, hadError };
    } catch (err) {
      hadError = true;
      logger.warn(
        "wre",
        `geocode via ${provider.name} failed for "${query}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { result: null, hadError };
}

/**
 * Geocode one listing address.
 *
 * `city` should already have the group's `defaultCity` applied by the caller —
 * this function does not know about groups.
 */
export async function geocodeAddress(city: string, street: string, houseNumber: string): Promise<GeocodeOutcome> {
  if (!street.trim()) return miss("no_address");
  if (!city.trim()) return miss("no_city");

  // No house number in the post: geocode against a placeholder instead of
  // refusing to map. "<street> <city>" alone scores just as high as a real
  // address — "השומר קרית אתא" hits 2418, well over SCORE_STRONG, because the
  // *street* matched perfectly — so the score can't tell "street-only" apart
  // from "exact address" on its own. Asking for house "1" specifically pins a
  // real building on the right street (not necessarily the right one), which
  // is why `houseNumberApprox` must be surfaced everywhere this listing is
  // shown — see `WreListing.houseNumberApprox`.
  const houseNumberApprox = !normalizeHouseNumber(houseNumber);
  const effectiveHouseNumber = houseNumberApprox ? PLACEHOLDER_HOUSE_NUMBER : houseNumber;

  const query = buildQuery(city, street, effectiveHouseNumber);
  if (!query) return miss("no_address");

  const { result, hadError } = await lookupAcrossProviders(query);

  if (!result || result.score < SCORE_FLOOR) return miss(hadError ? "geocode_error" : "geocode_miss");

  const { cityOk, numberOk } = verifyMatch(result.matchedText, city, effectiveHouseNumber);
  const strong = result.score >= SCORE_STRONG;

  // Keep the coordinates even when unsure: they seed the review pin near the
  // right area, so a human drags it a street rather than hunting from scratch.
  const partial: GeocodeOutcome = {
    lat: result.lat,
    lng: result.lng,
    score: result.score,
    matchedText: result.matchedText,
    provider: result.provider,
    reviewReason: null,
    houseNumberApprox,
  };

  if (!cityOk) return { ...partial, reviewReason: "geocode_miss" };
  if (!numberOk) return { ...partial, reviewReason: "low_score" };
  if (!strong) return { ...partial, reviewReason: "low_score" };

  return partial;
}
