/**
 * Israeli phone parsing/formatting for WRE.
 *
 * Deliberately **dependency-free** so both the server (extractor) and client
 * components (messages table, map popups) can import it. It previously lived in
 * `extractor.ts`, which imports the AI provider and the wa-engine logger — and
 * that logger pulls in Mongo. Importing it from a `"use client"` file dragged
 * the whole Mongo driver (`net`, `tls`, `dns`, `fs`) into the browser bundle and
 * broke the page outright. Keep this file free of imports.
 */

/**
 * Israeli mobile, in the shapes people actually type:
 * 050-1234567 · 0501234567 · 052 987 6543 · +972-50-1234567 · 972501234567
 */
const IL_MOBILE = /(?:\+?972[-.\s]?|\b0)(5\d)[-.\s]?(\d{3})[-.\s]?(\d{4})\b/;

/**
 * Read the contact phone out of the raw message text instead of trusting the model.
 *
 * Measured (2026-07-15): llama-3.3-70b mangles digits — it returned "52876543"
 * for "052-9876543", dropping the leading zero *and* an interior digit. A wrong
 * number is worse than no number: the UI links it straight to wa.me, so the
 * broker would message a stranger while believing they'd reached the seller.
 * The pattern is rigid, so a regex is strictly more reliable than any LLM here.
 *
 * Returns local form ("0501234567") — what an Israeli expects to read — or "".
 */
export function extractPhone(text: string): string {
  const m = (text || "").match(IL_MOBILE);
  return m ? `0${m[1]}${m[2]}${m[3]}` : "";
}

/** Local ("0501234567") → wa.me form ("972501234567"). `wa.me/0501234567` resolves to nothing. */
export const toWaMe = (localPhone: string): string =>
  /^0\d{9}$/.test(localPhone) ? `972${localPhone.slice(1)}` : (localPhone || "").replace(/\D/g, "");
