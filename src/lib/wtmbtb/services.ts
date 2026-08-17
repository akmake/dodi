/**
 * Service catalog — port of `Whatsapp/client/src/config/services.jsx`, extended
 * with WBR (the existing bootWhat dashboard). The switcher and the "בחר שירות"
 * screen are built from this.
 */
export interface ServiceNav {
  to: string;
  label: string;
  end?: boolean;
}

export interface ServiceDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  path: string;
  color: string;
  accent: string;
  active: boolean;
  nav: ServiceNav[];
}

export const SERVICES: Record<string, ServiceDef> = {
  wtm: {
    id: "wtm",
    name: "WTM",
    title: "WhatsApp ⇄ Mail",
    desc: "גשר דו-כיווני בין וואטסאפ למייל — האזנה להודעות והעברה אוטומטית בשני הכיוונים.",
    path: "/wtm",
    color: "#075E54",
    accent: "#25D366",
    active: true,
    nav: [
      { to: "/wtm", label: "לקוחות", end: true },
      { to: "/wtm/monitor", label: "ניטור" },
      { to: "/wtm/logs", label: "לוגים" },
    ],
  },
  btb: {
    id: "btb",
    name: "BTB",
    title: "Business Statuses",
    desc: "שירות לבעלי עסקים בדגש על אזור הסטטוסים. מתחבר לוואטסאפ באותה שיטה — לוגיקה ייעודית.",
    path: "/btb",
    color: "#1F3A5F",
    accent: "#3B82F6",
    active: true,
    nav: [{ to: "/btb", label: "סטטוסים", end: true }],
  },
  wta: {
    id: "wta",
    name: "WTA",
    title: "ניהול קבוצות",
    desc: "כלי ניהול קבוצות למנהלים — הבוט מחובר כאדמין ואוכף חוקים: מחיקת הודעות לפי מילים, חסימת קישורים, ונעילת קבוצה לפי שעות.",
    path: "/wta",
    color: "#4A2545",
    accent: "#A855F7",
    active: true,
    nav: [
      { to: "/wta", label: "לקוחות", end: true },
      { to: "/wta/monitor", label: "ניטור" },
      { to: "/wta/logs", label: "לוגים" },
    ],
  },
  wre: {
    id: "wre",
    name: "WRE",
    title: "נדל\"ן מהקבוצות",
    desc: "מאזין לקבוצות נדל\"ן, מחלץ מכל הודעה את הדירה (עיר, רחוב, מספר, חדרים, מחיר) וממקם אותה על המפה — במקום לגלול ידנית.",
    path: "/wre",
    color: "#1E3A2F",
    accent: "#10B981",
    active: true,
    // Everything is per-broker (tabs inside the broker), so there is nothing
    // global to navigate to — no shared screens with a client picker.
    nav: [{ to: "/wre", label: "מתווכים", end: true }],
  },
  wbr: {
    id: "wbr",
    name: "WBR",
    title: "WhatsApp הרשמי (bootWhat)",
    desc: "הפלטפורמה הרשמית מול Meta — בוט AI, אינבוקס, CRM, תהליכי שיחה, קמפיינים ועוד.",
    path: "/dashboard",
    color: "#128C7E",
    accent: "#25D366",
    active: true,
    nav: [],
  },
};

export const SERVICE_LIST = Object.values(SERVICES);

/** Resolve the active service from the current pathname (e.g. "/wtm/logs" -> wtm). */
export function serviceFromPath(pathname: string): ServiceDef | null {
  return SERVICE_LIST.find((s) => pathname === s.path || pathname.startsWith(s.path + "/")) || null;
}
