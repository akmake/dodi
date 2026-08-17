/**
 * Node catalog — the single source of truth for the AI Flow Architect ([קטגוריה 27]).
 *
 * Describes every engine node type in a machine- AND model-readable form: what it
 * does, which `data` fields it requires, and which outgoing branch handles it
 * produces. Two consumers share this one definition:
 *   1. `prompt.ts` — renders it into the system prompt so the AI builds only from
 *      real nodes with real fields.
 *   2. `validator.ts` — checks an AI- (or human-) built graph against it.
 *
 * Keep this in lock-step with the engine (`src/modules/flows/service.ts`) and the
 * builder UI catalog (`src/app/dashboard/flows/page.tsx`).
 */
import type { FlowNodeType } from "@/modules/flows";

/** How a node's outgoing branch handles are determined. */
export type HandleSpec =
  | { kind: "single" } //  one default output (or none if terminal)
  | { kind: "fixed"; handles: string[]; optional?: string[] } // e.g. condition → true/false
  | { kind: "dynamic"; from: string; defaultHandle?: string }; // handles derived from a data array

export interface DataFieldSpec {
  key: string;
  /** Hebrew label, for the prompt. */
  label: string;
  required?: boolean;
  /** Free-text note for the AI (format, examples, constraints). */
  note?: string;
}

export interface NodeSpec {
  type: FlowNodeType;
  label: string;
  /** One-line Hebrew description of what the node does (for the AI). */
  purpose: string;
  category: string;
  data: DataFieldSpec[];
  handles: HandleSpec;
  /** Terminal nodes end a branch — no outgoing edge expected. */
  terminal?: boolean;
  /** References a tenant entity the AI must wire by real id (action/template/…). */
  needsEntity?: "action" | "template" | "resource" | "collection";
}

export const CATALOG: NodeSpec[] = [
  // ── התחלה וסיום ────────────────────────────────────────────────
  {
    type: "start", label: "התחלה", category: "התחלה וסיום",
    purpose: "נקודת הכניסה לתהליך. כל תהליך חייב בדיוק אחד.",
    data: [{ key: "keyword", label: "מילת הפעלה", note: "מילה/ביטוי שכתיבתו ע\"י הלקוח מתחיל את התהליך (אופציונלי)" }],
    handles: { kind: "single" },
  },
  {
    type: "end", label: "סיום", category: "התחלה וסיום",
    purpose: "סיום התהליך, עם הודעת פרידה אופציונלית.",
    data: [{ key: "text", label: "הודעת סיום", note: "אופציונלי" }],
    handles: { kind: "single" }, terminal: true,
  },
  {
    type: "stop", label: "עצירה", category: "התחלה וסיום",
    purpose: "עצירה מיידית של התהליך בלי הודעה.",
    data: [], handles: { kind: "single" }, terminal: true,
  },
  {
    type: "jump_to_node", label: "קפיצה לצומת", category: "התחלה וסיום",
    purpose: "קפיצה לוגית לצומת אחר באותו תהליך (לולאות/קיצורים).",
    data: [{ key: "targetNodeId", label: "מזהה צומת היעד", required: true }],
    handles: { kind: "single" }, terminal: true,
  },

  // ── הודעות ────────────────────────────────────────────────────
  {
    type: "message", label: "הודעת טקסט", category: "הודעות",
    purpose: "שולח הודעת טקסט ללקוח. ממשיך הלאה אוטומטית.",
    data: [{ key: "text", label: "תוכן ההודעה", required: true, note: "אפשר משתנים: {{contact.firstName}}, {{state.x}}" }],
    handles: { kind: "single" },
  },
  {
    type: "buttons", label: "כפתורי בחירה", category: "הודעות",
    purpose: "שולח עד 3 כפתורים וממתין לבחירת הלקוח. כל כפתור = ענף נפרד.",
    data: [
      { key: "text", label: "תוכן ההודעה", required: true },
      { key: "buttons", label: "כפתורים", required: true, note: "מערך [{id, label}], 1–3 פריטים. ה-id של כל כפתור הוא ה-sourceHandle של הענף שלו." },
      { key: "header", label: "כותרת (אופציונלי)", note: "{kind:'text'|'image'|'video'|'document', text?/link?, filename?} — תמונה+טקסט+כפתורים = הודעה אחת" },
      { key: "footer", label: "כיתוב תחתון (אופציונלי)", note: "טקסט עד 60 תווים" },
    ],
    handles: { kind: "dynamic", from: "buttons" },
  },
  {
    type: "list", label: "רשימת בחירה", category: "הודעות",
    purpose: "שולח רשימה אינטראקטיבית (עד 10 שורות) וממתין לבחירה. כל שורה = ענף.",
    data: [
      { key: "text", label: "תוכן ההודעה", required: true },
      { key: "buttonLabel", label: "תווית הכפתור הפותח", note: "ברירת מחדל: בחר" },
      { key: "rows", label: "שורות", required: true, note: "מערך [{id, title, description?}], עד 10. ה-id הוא ה-sourceHandle." },
      { key: "header", label: "כותרת (אופציונלי)", note: "{kind:'text', text} — כותרת רשימה היא טקסט בלבד" },
      { key: "footer", label: "כיתוב תחתון (אופציונלי)", note: "טקסט עד 60 תווים" },
    ],
    handles: { kind: "dynamic", from: "rows" },
  },
  {
    type: "media", label: "מדיה", category: "הודעות",
    purpose: "שולח תמונה/וידאו/אודיו/מסמך.",
    data: [
      { key: "mediaKind", label: "סוג", required: true, note: "image | video | audio | document" },
      { key: "link", label: "קישור URL", required: true, note: "כתובת ציבורית של הקובץ" },
      { key: "caption", label: "כיתוב", note: "אופציונלי; לא ב-audio" },
    ],
    handles: { kind: "single" },
  },
  {
    type: "location", label: "שליחת מיקום", category: "הודעות",
    purpose: "שולח סיכת מיקום ללקוח.",
    data: [
      { key: "latitude", label: "קו רוחב", required: true },
      { key: "longitude", label: "קו אורך", required: true },
      { key: "name", label: "שם המקום", note: "אופציונלי" },
      { key: "address", label: "כתובת", note: "אופציונלי" },
    ],
    handles: { kind: "single" },
  },
  {
    type: "template", label: "תבנית מאושרת", category: "הודעות",
    purpose: "שולח תבנית WhatsApp מאושרת. נדרש כשמחוץ לחלון 24 שעות.",
    data: [
      { key: "name", label: "שם התבנית", required: true, note: "חייב להיות שם תבנית קיימת מרשימת התבניות" },
      { key: "language", label: "שפה", note: "ברירת מחדל he" },
    ],
    handles: { kind: "single" }, needsEntity: "template",
  },

  // ── קלט ולוגיקה ────────────────────────────────────────────────
  {
    type: "question", label: "שאלה ושמירה", category: "קלט ולוגיקה",
    purpose: "שואל שאלה פתוחה, ממתין, ושומר את התשובה לשדה ב-state.",
    data: [
      { key: "text", label: "השאלה", required: true },
      { key: "field", label: "שם השדה לשמירה", required: true, note: "התשובה תישמר ב-state.<field>" },
    ],
    handles: { kind: "single" },
  },
  {
    type: "wait_reply", label: "המתנה לתשובה", category: "קלט ולוגיקה",
    purpose: "ממתין לתשובת הלקוח עם פסק-זמן. ענף 'reply' אם ענה, 'timeout' אם לא.",
    data: [
      { key: "text", label: "הודעה ללקוח", note: "אופציונלי" },
      { key: "field", label: "שמירת תשובה לשדה", note: "אופציונלי" },
      { key: "timeoutMinutes", label: "פסק-זמן (דקות)", note: "0 = ללא timeout" },
    ],
    handles: { kind: "fixed", handles: ["reply"], optional: ["timeout"] },
  },
  {
    type: "validate", label: "ולידציה", category: "קלט ולוגיקה",
    purpose: "בודק ערך (regex/אורך/חובה) ומסתעף 'valid'/'invalid'.",
    data: [
      { key: "field", label: "שדה לבדיקה", required: true, note: "נתיב: message.text, state.email וכו'" },
      { key: "required", label: "חובה", note: "boolean" },
      { key: "regex", label: "תבנית regex", note: "אופציונלי" },
      { key: "minLength", label: "אורך מינ'", note: "מספר, אופציונלי" },
      { key: "maxLength", label: "אורך מקס'", note: "מספר, אופציונלי" },
    ],
    handles: { kind: "fixed", handles: ["valid", "invalid"] },
  },
  {
    type: "condition", label: "תנאי (if/else)", category: "קלט ולוגיקה",
    purpose: "מסתעף לפי תנאי בוליאני. ענף 'true' / 'false'.",
    data: [
      { key: "condField", label: "שדה", required: true, note: "נתיב: contact.status, state.x, ai.intent" },
      { key: "condOp", label: "אופרטור", required: true, note: "eq | neq | contains | gt | lt | is_empty | is_not_empty" },
      { key: "condValue", label: "ערך", note: "לא נדרש ל-is_empty/is_not_empty" },
    ],
    handles: { kind: "fixed", handles: ["true", "false"] },
  },
  {
    type: "switch", label: "פיצול לפי ערך", category: "קלט ולוגיקה",
    purpose: "מסתעף לפי ערך שדה — ענף לכל ערך + ענף 'default'.",
    data: [
      { key: "field", label: "שדה לבדיקה", required: true },
      { key: "cases", label: "ענפים", required: true, note: "מערך [{value, handle}]; handle = ה-sourceHandle." },
    ],
    handles: { kind: "dynamic", from: "cases", defaultHandle: "default" },
  },
  {
    type: "split", label: "פיצול אקראי (A/B)", category: "קלט ולוגיקה",
    purpose: "מסתעף אקראית לפי משקלים — בדיקות A/B.",
    data: [{ key: "branches", label: "וריאנטים", required: true, note: "מערך [{handle, weight, label}]." }],
    handles: { kind: "dynamic", from: "branches" },
  },
  {
    type: "delay", label: "המתנה", category: "קלט ולוגיקה",
    purpose: "ממתין N דקות וממשיך אוטומטית (דרך scheduler).",
    data: [{ key: "minutes", label: "דקות", required: true }],
    handles: { kind: "single" },
  },

  // ── נתונים ופעולות ────────────────────────────────────────────
  {
    type: "set_field", label: "עדכון שדה לקוח", category: "נתונים ופעולות",
    purpose: "כותב ערך לשדה לקוח (וגם ל-state).",
    data: [
      { key: "field", label: "שם השדה", required: true },
      { key: "value", label: "ערך", required: true },
    ],
    handles: { kind: "single" },
  },
  {
    type: "set_var", label: "חישוב משתנה", category: "נתונים ופעולות",
    purpose: "מחשב/מעצב ערך לתוך state.",
    data: [
      { key: "target", label: "שם המשתנה", required: true },
      { key: "value", label: "ערך/ביטוי", required: true, note: "אפשר {{...}}" },
      { key: "transform", label: "עיבוד", note: "none | uppercase | lowercase | trim | number | date_now" },
    ],
    handles: { kind: "single" },
  },
  {
    type: "data", label: "טבלת נתונים", category: "נתונים ופעולות",
    purpose: "קורא/כותב לטבלת-נתונים פנימית (מאגר מידע) — תורים, מלאי, הרשמות וכו'. find/get/aggregate מסתעף found/empty; insert/update/delete/increment מסתעף success/error.",
    data: [
      { key: "collection", label: "טבלה", required: true, note: "שם טבלת-נתונים קיימת מרשימת מאגרי-המידע" },
      { key: "op", label: "פעולה", required: true, note: "find | get | aggregate | insert | update | delete | increment" },
      { key: "filter", label: "סינון", note: "מערך [{field, op, value}] ל-find/get/aggregate/update/delete/increment; value תומך {{state.x}}/{{contact.x}}" },
      { key: "values", label: "ערכים", note: "מערך [{key, value}] ל-insert/update; value תומך {{...}}" },
      { key: "field", label: "שדה", note: "ל-increment (שדה מונה); ל-aggregate (שדה מספרי ל-sum/avg/min/max)" },
      { key: "amount", label: "כמות", note: "ל-increment; מספר שלילי = הקטנה (מוגן מירידה מתחת ל-0 — אידאלי למלאי)" },
      { key: "metric", label: "חישוב", note: "ל-aggregate: count | sum | avg | min | max (ברירת מחדל count). התוצאה ב-{{state.<outputKey>Value}} כשאין קיבוץ" },
      { key: "groupBy", label: "קיבוץ לפי", note: "ל-aggregate בלבד: שם שדה לקיבוץ (אופציונלי)" },
      { key: "expand", label: "פתיחת הפניות", note: "ל-find/get: שמות שדות-reference לפתיחה (מחרוזת מופרדת בפסיק); כל הפניה נטענת תחת <field>__ref" },
      { key: "outputKey", label: "שמירת תוצאה ל-state", note: "ברירת מחדל data" },
    ],
    handles: { kind: "single" }, needsEntity: "collection",
  },
  {
    type: "tag", label: "תגית", category: "נתונים ופעולות",
    purpose: "מוסיף/מסיר תגית מאיש הקשר.",
    data: [
      { key: "op", label: "פעולה", required: true, note: "add | remove" },
      { key: "tag", label: "תגית", required: true },
    ],
    handles: { kind: "single" },
  },
  {
    type: "action", label: "פעולה עסקית", category: "נתונים ופעולות",
    purpose: "מריץ Business Action רשומה. מסתעף 'success'/'error'.",
    data: [
      { key: "actionId", label: "מזהה פעולה", required: true, note: "חייב להיות id פעולה קיימת מהרשימה" },
      { key: "outputKey", label: "שמירת תוצאה למשתנה", note: "אופציונלי" },
    ],
    handles: { kind: "fixed", handles: ["success"], optional: ["error"] }, needsEntity: "action",
  },
  {
    type: "api", label: "קריאת API", category: "נתונים ופעולות",
    purpose: "קריאת HTTP חיצונית עם מיפוי תשובה ל-state. מסתעף 'success'/'error'.",
    data: [
      { key: "url", label: "כתובת", required: true, note: "אפשר {{...}}" },
      { key: "method", label: "שיטה", note: "GET | POST | PUT | DELETE; ברירת מחדל GET" },
      { key: "outputKey", label: "שמירת תשובה למשתנה", note: "אופציונלי" },
    ],
    handles: { kind: "fixed", handles: ["success"], optional: ["error"] },
  },
  {
    type: "run_code", label: "הרצת קוד JS", category: "נתונים ופעולות",
    purpose: "מריץ JS מבודד. גישה ל-state ו-input; return מחזיר ערך. מסתעף 'success'/'error'.",
    data: [
      { key: "code", label: "קוד", required: true, note: "JS; השתמש ב-return" },
      { key: "outputKey", label: "שמירת תוצאה", note: "ברירת מחדל codeResult" },
    ],
    handles: { kind: "fixed", handles: ["success"], optional: ["error"] },
  },

  // ── AI ותפעול ─────────────────────────────────────────────────
  {
    type: "ai", label: "תגובת AI", category: "AI ותפעול",
    purpose: "תגובת AI חופשית מבוססת מאגר-הידע. ממשיך הלאה.",
    data: [{ key: "text", label: "הוראה ל-AI", note: "אופציונלי; ריק = תגובה חופשית מהידע" }],
    handles: { kind: "single" },
  },
  {
    type: "ai_classify", label: "סיווג כוונה (AI)", category: "AI ותפעול",
    purpose: "מסווג את כוונת הלקוח ומסתעף לפיה + ענף 'default'.",
    data: [
      { key: "outputKey", label: "שמירת כוונה למשתנה", note: "ברירת מחדל intent" },
      { key: "cases", label: "ענפים לפי כוונה", required: true, note: "מערך [{value, handle}]." },
    ],
    handles: { kind: "dynamic", from: "cases", defaultHandle: "default" },
  },
  {
    type: "ai_extract", label: "חילוץ ישויות (AI)", category: "AI ותפעול",
    purpose: "מחלץ שדות (שם/תאריך/כתובת...) מטקסט חופשי ל-state.",
    data: [
      { key: "sourceField", label: "שדה מקור", note: "ברירת מחדל message.text" },
      { key: "fields", label: "שדות לחילוץ", required: true, note: "מערך [{key, description?}]." },
    ],
    handles: { kind: "single" },
  },
  {
    type: "handoff", label: "העברה לנציג", category: "AI ותפעול",
    purpose: "מעביר את השיחה לנציג אנושי ומשתיק את ה-AI. עוצר את התהליך.",
    data: [{ key: "reason", label: "סיבה", note: "customer_request | ai_low_confidence | negative_sentiment | manual" }],
    handles: { kind: "single" }, terminal: true,
  },
  {
    type: "appointment", label: "קביעת תור", category: "AI ותפעול",
    purpose: "מציע מועדים פנויים, ממתין לבחירה, וקובע. מסתעף 'success'/'error'.",
    data: [
      { key: "resourceId", label: "מזהה משאב", required: true, note: "חייב להיות id משאב-תורים קיים" },
      { key: "days", label: "טווח ימים", note: "ברירת מחדל 7" },
      { key: "text", label: "הודעת הצגה", note: "אופציונלי" },
    ],
    handles: { kind: "fixed", handles: ["success"], optional: ["error"] }, needsEntity: "resource",
  },
  {
    type: "jump", label: "מעבר לתהליך", category: "AI ותפעול",
    purpose: "מעביר ל-flow אחר (תת-תהליך). מסתעף 'error' אם נכשל.",
    data: [{ key: "targetFlowId", label: "מזהה תהליך יעד", required: true }],
    handles: { kind: "fixed", handles: [], optional: ["error"] }, terminal: true,
  },
];

const BY_TYPE = new Map<string, NodeSpec>(CATALOG.map((s) => [s.type, s]));

export function specFor(type: string): NodeSpec | undefined {
  return BY_TYPE.get(type);
}

export function isKnownType(type: string): boolean {
  return BY_TYPE.has(type);
}
