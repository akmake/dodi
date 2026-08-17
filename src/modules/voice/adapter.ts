/**
 * Telephony adapter seam — [קטגוריה 26].
 *
 * Translates carrier-neutral `VoiceInstruction`s into a specific carrier's call
 * markup. The IVR engine never speaks a carrier dialect; swapping Twilio for
 * Vonage is implementing one `TelephonyAdapter`. A generic JSON adapter (for
 * tests / custom carriers) and a Twilio TwiML adapter ship here.
 */
import type { VoiceInstruction } from "./models";

export interface TelephonyAdapter {
  name: string;
  /** Render a sequence of instructions into the carrier's response body. */
  render(instructions: VoiceInstruction[], opts: { actionUrl: string; lang?: string }): { contentType: string; body: string };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Twilio TwiML adapter (the common reference carrier). */
export const twilioAdapter: TelephonyAdapter = {
  name: "twilio",
  render(instructions, { actionUrl, lang = "he-IL" }) {
    const parts: string[] = [];
    for (const ins of instructions) {
      switch (ins.verb) {
        case "say":
          parts.push(`<Say language="${lang}">${escapeXml(ins.text)}</Say>`);
          break;
        case "gather":
          parts.push(
            `<Gather numDigits="${ins.numDigits}" timeout="${ins.timeoutSec}" action="${escapeXml(actionUrl)}">` +
              (ins.prompt ? `<Say language="${lang}">${escapeXml(ins.prompt)}</Say>` : "") +
              `</Gather>`
          );
          break;
        case "dial":
          parts.push(`<Dial>${escapeXml(ins.target)}</Dial>`);
          break;
        case "record":
          parts.push(`<Say language="${lang}">${escapeXml(ins.prompt)}</Say><Record action="${escapeXml(actionUrl)}" />`);
          break;
        case "hangup":
          parts.push(`<Hangup/>`);
          break;
      }
    }
    return { contentType: "text/xml", body: `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>` };
  },
};

/** Carrier-neutral JSON adapter — returns the instruction list verbatim. */
export const jsonAdapter: TelephonyAdapter = {
  name: "json",
  render(instructions) {
    return { contentType: "application/json", body: JSON.stringify({ instructions }) };
  },
};

const ADAPTERS: Record<string, TelephonyAdapter> = {
  twilio: twilioAdapter,
  json: jsonAdapter,
};

/** Resolve an adapter by carrier name, defaulting to Twilio. */
export function getAdapter(name?: string): TelephonyAdapter {
  return (name && ADAPTERS[name]) || twilioAdapter;
}
