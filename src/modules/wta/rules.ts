/**
 * WTA rule evaluation — pure functions that decide whether a group message
 * violates a moderation rule. No side effects (the handler performs the actual
 * delete/warn/kick); keeping this isolated makes it easy to unit-test.
 */
import type { KeywordDeleteRule, LinkDeleteRule, OnMatchAction, RuleSchedule } from "./models";

export const DEFAULT_TZ = "Asia/Jerusalem";

/** Current minute-of-day + day-of-week (0=Sun) in the given IANA timezone. */
export function nowInTz(tz = DEFAULT_TZ, at = new Date()): { minutes: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some environments emit "24" for midnight
  const minute = parseInt(get("minute"), 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: hour * 60 + minute, day: dayMap[get("weekday")] ?? 0 };
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

/** Is `time` (minutes) inside [from, to)? Wraps past midnight when to < from. */
export function inTimeWindow(minutes: number, from: string, to: string): boolean {
  const f = toMin(from);
  const t = toMin(to);
  if (f === t) return true; // full-day window
  return f < t ? minutes >= f && minutes < t : minutes >= f || minutes < t;
}

/** Whether a rule's optional active-hours window includes "now". null schedule = always. */
export function scheduleActive(schedule: RuleSchedule | null, tz = DEFAULT_TZ): boolean {
  if (!schedule) return true;
  const { minutes, day } = nowInTz(tz);
  if (schedule.days?.length && !schedule.days.includes(day)) return false;
  return inTimeWindow(minutes, schedule.from, schedule.to);
}

// ─── keyword ─────────────────────────────────────────────────────────────────

/** Returns the offending word, or null if the message is clean. */
export function matchKeyword(rule: KeywordDeleteRule, text: string): string | null {
  if (!text) return null;
  const hay = rule.caseSensitive ? text : text.toLowerCase();
  for (const raw of rule.words) {
    const word = raw.trim();
    if (!word) continue;
    const needle = rule.caseSensitive ? word : word.toLowerCase();
    if (rule.mode === "regex") {
      try {
        if (new RegExp(word, rule.caseSensitive ? "" : "i").test(text)) return raw;
      } catch {
        // invalid pattern — skip this word rather than throwing
      }
    } else if (rule.mode === "exact") {
      // whole-word (token) match
      const tokens = hay.split(/[\s,.!?;:()"'\-־–—]+/).filter(Boolean);
      if (tokens.includes(needle)) return raw;
    } else {
      // contains
      if (hay.includes(needle)) return raw;
    }
  }
  return null;
}

// ─── links ───────────────────────────────────────────────────────────────────

const INVITE_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;

const hostOf = (url: string): string => {
  try {
    const u = url.startsWith("http") ? url : `http://${url}`;
    return new URL(u).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Returns a human reason ("קישור הזמנה" / the URL), or null if the message is clean. */
export function matchLink(rule: LinkDeleteRule, text: string): string | null {
  if (!text) return null;

  if (rule.includeInviteLinks) {
    const inv = text.match(INVITE_RE);
    if (inv) return "קישור הזמנה לקבוצה";
  }

  if (rule.includeAllLinks) {
    const allow = (rule.allowlist ?? []).map((d) => d.replace(/^www\./, "").toLowerCase());
    const urls = text.match(URL_RE) ?? [];
    for (const url of urls) {
      const host = hostOf(url);
      if (host && allow.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      return url;
    }
  }

  return null;
}

// ─── combined ────────────────────────────────────────────────────────────────

export interface Violation {
  ruleId: string;
  ruleName: string;
  action: OnMatchAction;
  reason: string;
  warnText: string;
}

/** Does this rule apply to the given group? (null/empty groupIds = all managed groups.) */
export function ruleAppliesToGroup(ruleGroupIds: string[] | null, groupId: string): boolean {
  if (!ruleGroupIds || ruleGroupIds.length === 0) return true;
  const norm = (id: string) => id.replace(/:\d+$/, "");
  return ruleGroupIds.some((g) => norm(g) === norm(groupId));
}
