/**
 * Hebrew address normalization for WRE.
 *
 * Deliberately light. Empirically govmap's own matcher already absorbs the
 * variation we most feared — it resolves both "ויצמן" and "וייצמן", and both
 * "קרית"/"קריית" — so aggressive rewriting here would only risk destroying a
 * string the provider would have matched anyway. We therefore only strip noise
 * that is never part of an indexed address (street-type prefixes, quotes,
 * apartment/floor chatter) and expand abbreviations the index does not carry.
 */

/** Hebrew letter range — used to build token boundaries by hand. */
const HEB = "א-ת";

/**
 * Hebrew-safe "whole token" matcher.
 *
 * JavaScript's `\b` is defined over ASCII word characters only, so it never
 * fires between two Hebrew letters — `/\bת"א\b/` silently matches nothing at
 * all. These explicit boundaries are the working equivalent.
 */
const aliasRe = (body: string) => new RegExp(`(^|[^${HEB}])(?:${body})(?![${HEB}])`, "g");

/** City abbreviations people actually type in groups → the full name govmap indexes. */
const CITY_ALIASES: Array<[RegExp, string]> = [
  [aliasRe(`ת["']?א`), "תל אביב"],
  [aliasRe(`תל[- ]אביב(?:[- ]יפו)?`), "תל אביב"],
  [aliasRe(`י["']?ם`), "ירושלים"],
  [aliasRe(`ב["']?ש`), "באר שבע"],
  [aliasRe(`פ["']?ת`), "פתח תקווה"],
  [aliasRe(`ר["']?ג`), "רמת גן"],
  [aliasRe(`ראשל["']?צ`), "ראשון לציון"],
  [aliasRe(`כ["']?ס`), "כפר סבא"],
];

/** Street-type prefixes — govmap matches the bare street name, these only add noise. */
const STREET_PREFIXES = /^(רחוב|רח['׳"]?|שדרות|שד['׳"]?|שדרה|סמטת|סמטה|דרך|כיכר|ככר)\s+/;

/** Normalize Hebrew quote/apostrophe variants to a single ASCII form. */
const unifyQuotes = (s: string) => s.replace(/[׳′’']/g, "'").replace(/[״″”"]/g, '"');

/** Collapse whitespace and trim punctuation that clings to address fragments. */
const tidy = (s: string) =>
  s
    .replace(/[‎‏‪-‮]/g, "") // bidi control marks — invisible, break matching
    .replace(/\s+/g, " ")
    .replace(/^[\s,.\-–—:|]+|[\s,.\-–—:|]+$/g, "")
    .trim();

export function normalizeCity(raw: string): string {
  let s = tidy(unifyQuotes(raw || ""));
  if (!s) return "";
  // `$1` preserves the boundary character the alias consumed.
  for (const [re, full] of CITY_ALIASES) s = s.replace(re, `$1${full}`);
  return tidy(s);
}

/**
 * Collapse a Hebrew string to a spelling-insensitive comparison form.
 *
 * Hebrew place names are legitimately written several ways and govmap's index
 * picks exactly one: it stores "קריית מלאכי" while everyone types "קרית מלאכי",
 * and it stores "תל אביב-יפו" where people type "תל אביב". Comparing the raw
 * strings therefore rejects matches that are in fact correct. Collapsing the
 * optional mater-lectionis doubling (יי→י, וו→ו) and dropping every separator
 * makes those forms compare equal.
 *
 * Only ever used for *comparison* — never for building a provider query, since
 * the provider wants the natural spelling.
 */
export function looseHebrew(s: string): string {
  return unifyQuotes(s || "")
    .replace(/[^א-ת0-9]/g, "") // drop spaces, hyphens, quotes, latin, bidi marks
    .replace(/יי/g, "י")
    .replace(/וו/g, "ו");
}

export function normalizeStreet(raw: string): string {
  let s = tidy(unifyQuotes(raw || ""));
  if (!s) return "";
  s = s.replace(STREET_PREFIXES, "");
  return tidy(s);
}

/** Keep only the leading integer of a house number ("13ב", "13/4", "13 דירה 2" → "13"). */
export function normalizeHouseNumber(raw: string): string {
  const m = String(raw ?? "").match(/\d{1,4}/);
  return m ? m[0] : "";
}

/**
 * Build the provider query. Format mirrors how govmap's index stores addresses
 * ("<street> <number> <city>"), which is what scored ~4,200-4,700 in testing.
 */
export function buildQuery(city: string, street: string, houseNumber: string): string {
  const c = normalizeCity(city);
  const s = normalizeStreet(street);
  const n = normalizeHouseNumber(houseNumber);
  if (!c || !s) return "";
  return tidy([s, n, c].filter(Boolean).join(" "));
}

/** Cache key — same address written differently must collapse to one entry. */
export const cacheKey = (query: string) => tidy(unifyQuotes(query)).toLowerCase();

/**
 * Identity of an apartment, for repost/cross-post collapsing. Rooms are included
 * because one building legitimately hosts many distinct listings; price is not,
 * because sellers re-post the same flat at a new price and that is the same flat.
 */
export function dedupKey(city: string, street: string, houseNumber: string, rooms: number | null): string {
  const c = normalizeCity(city);
  const s = normalizeStreet(street);
  const n = normalizeHouseNumber(houseNumber);
  if (!c || !s) return "";
  return [c, s, n, rooms ?? ""].join("|").toLowerCase();
}

/**
 * Does the provider's matched text actually correspond to what we asked for?
 *
 * This exists because score alone lies: the bare query "דיזנגוף" returns
 * "דיזנגוף 1 נתניה" at score ~1360 — a real address, but the wrong house number
 * in the wrong city. Verifying the returned text carries our house number and
 * our city turns a fuzzy top-hit into a checkable claim.
 */
export function verifyMatch(
  matchedText: string,
  city: string,
  houseNumber: string
): { cityOk: boolean; numberOk: boolean } {
  const hay = tidy(unifyQuotes(matchedText || ""));
  const wantNum = normalizeHouseNumber(houseNumber);

  // Compare on the loosened form: govmap answers "ויצמן 13 קריית מלאכי" to a
  // query for "וייצמן 13 קרית מלאכי" — the same place, spelled its way. A literal
  // substring test would call that correct match a failure.
  const hayLoose = looseHebrew(normalizeCity(hay));
  const wantLoose = looseHebrew(normalizeCity(city));
  const cityOk = !wantLoose || hayLoose.includes(wantLoose);

  // Match the house number as a standalone token so "13" does not match "130".
  const numberOk = !wantNum || new RegExp(`(^|\\D)${wantNum}(\\D|$)`).test(hay);

  return { cityOk, numberOk };
}
