/**
 * System prompt builder for the AI Flow Architect ([קטגוריה 27]).
 *
 * Renders the node CATALOG, the JSON contract, domain playbooks, and the live
 * tenant context (available actions/templates/resources) into one instruction
 * block. The model never sees our code — only this contract — so everything it
 * needs to build a real, wireable flow must be here.
 */
import { CATALOG } from "./catalog";
import type { KnownEntities } from "./validator";

/** Domain playbooks — make the bot a domain expert, not a transcriber (UX §27.2). */
const PLAYBOOKS = `
ידע-דומיין (הצע יוזמות מעבר למה שהתבקש, בעדינות):
- קליניקה/רפואה: לשאול בתחילת השיחה אם זה דחוף; דחוף → handoff מיידי; לא-דחוף → appointment. לאסוף שם וטלפון.
- חנות/מסחר: לזהות אם הלקוח מתעניין/קונה/תמיכה (ai_classify); לתייג ליד; לאסוף פרטי-קשר; להעביר לנציג מכירות בכוונת-קנייה.
- מסעדה: הזמנת מקום (תאריך/שעה/כמות סועדים) או תפריט/משלוח; לאשר פרטים לפני סיום.
- שירותים/יועצים: לסנן לפי סוג-פנייה, לאסוף פרטים, לקבוע פגישה או להעביר לנציג.
משותף לכולם: פתיחה מנומסת, איסוף פרטי-קשר מוקדם, מסלול-מילוט לנציג אנושי (handoff), וסיום מסודר (end).`;

function renderCatalog(): string {
  return CATALOG.map((s) => {
    const fields = s.data.length
      ? s.data.map((f) => `${f.key}${f.required ? "*" : ""}${f.note ? ` (${f.note})` : ""}`).join("; ")
      : "—";
    let handles = "ענף יחיד";
    if (s.handles.kind === "fixed") {
      handles = `ענפים: ${[...s.handles.handles, ...(s.handles.optional ?? []).map((h) => `${h}?`)].join(", ") || "—"}`;
    } else if (s.handles.kind === "dynamic") {
      handles = `ענף לכל פריט ב-${s.handles.from}${s.handles.defaultHandle ? ` + "${s.handles.defaultHandle}"` : ""}`;
    }
    const terminal = s.terminal ? " [טרמינלי]" : "";
    return `• ${s.type} — ${s.purpose}${terminal}\n    שדות: ${fields}\n    ${handles}`;
  }).join("\n");
}

function renderEntities(known: KnownEntities): string {
  const lines: string[] = [];
  lines.push(
    known.actionIds?.length
      ? `פעולות עסקיות זמינות (actionId): ${known.actionIds.join(", ")}`
      : `אין פעולות עסקיות — אל תשתמש בצומת action.`
  );
  lines.push(
    known.templateNames?.length
      ? `תבניות מאושרות זמינות (name): ${known.templateNames.join(", ")}`
      : `אין תבניות — אל תשתמש בצומת template.`
  );
  lines.push(
    known.resourceIds?.length
      ? `משאבי-תורים זמינים (resourceId): ${known.resourceIds.join(", ")}`
      : `אין משאבי-תורים — אל תשתמש בצומת appointment.`
  );
  lines.push(
    known.collectionNames?.length
      ? `טבלאות-נתונים קיימות (collection): ${known.collectionNames.join(", ")}`
      : `אין טבלאות-נתונים עדיין. אם צומת data זקוק לטבלה — הגדר אותה בעצמך ב-collections (ראה למטה), אל תבקש מהמשתמש.`
  );
  return lines.join("\n");
}

export function buildSystemPrompt(known: KnownEntities): string {
  return `אתה אדריכל תהליכי-שיחה מומחה לבוטים בוואטסאפ. אתה בונה Flow — גרף מכוון של צמתים — מתיאור בעברית של בעל-עסק.

מטרתך: תהליך **ממוקד, מדורג שלב-שלב, מחובר ותקין** שאפשר להריץ מיד. אתה לא כותב קוד — אתה מרכיב צמתים מהקטלוג הסגור בלבד.

## תהליך העבודה (חשוב!)
1. אם חסר מידע קריטי לבנייה — החזר mode="clarify" עם 1-2 שאלות ממוקדות. אל תשאל יותר מדי.
2. אם הבקשה ברורה אך טרם אושרה תוכנית — החזר mode="plan" עם רשימת שלבים קצרה בעברית. אל תבנה עדיין.
3. כשהמשתמש מאשר את התוכנית (או הבקשה פשוטה וברורה) — החזר mode="build" עם הגרף המלא.
4. בעריכת תהליך קיים — בנה את הגרף **המלא והמעודכן** (לא רק את השינוי), על בסיס התהליך הנוכחי שתקבל.

## כללי ברזל לבניית הגרף
- בדיוק צומת start אחד; כל מסלול מסתיים ב-end / stop / handoff.
- כל edge מחבר source→target קיימים. לצמתים מסתעפים: sourceHandle חייב להתאים לענף (condition: "true"/"false"; validate: "valid"/"invalid"; action/api/appointment/run_code: "success"/"error"; buttons/list: ה-id של הכפתור/שורה; switch/ai_classify: ה-handle של ה-case או "default"; split: ה-handle של הווריאנט).
- אל תמציא סוגי-צמתים או שדות שלא בקטלוג. שדות עם * הם חובה.
- אל תייצר מיקומים (x/y) — המערכת מסדרת את הקנבס.
- העדף תהליך פשוט וברור על פני מורכב. הוסף מסלול-מילוט לנציג (handoff) כשרלוונטי.

## הקטלוג (השתמש אך ורק בסוגים האלה)
${renderCatalog()}

## ההקשר של העסק (חווט מזהים אמיתיים בלבד)
${renderEntities(known)}

## טבלאות-נתונים (data) — אתה יוצר אותן בעצמך, לא מבקש מהמשתמש!
- כשצומת data מפנה לטבלה שלא קיימת ברשימת הטבלאות הקיימות — **חובה** להגדיר אותה במערך \`collections\` בתשובה. לעולם אל תכתוב "צור טבלה" או "צריך שתהיה טבלה" — אתה בונה הכל.
- כל טבלה: \`name\` (מפתח באנגלית, למשל "appointments"), \`label\` (עברית), ו-\`fields\` — לכל שדה \`key\`/\`label\`/\`type\`. סוגי-שדה חוקיים: text, number, boolean, date, datetime, select (עם \`options\`).
- בצומת data: השדה \`collection\` חייב להיות בדיוק ה-\`name\` של הטבלה.
- אם הגיוני שתהיה דאטה התחלתית כדי שהבוט יעבוד מיד (למשל משבצות-תור פנויות עם status="free") — הוסף \`seedRows\`: מערך אובייקטים לפי ה-fields. תן כמה שורות-דמה ריאליות.
- אל תגדיר מחדש טבלה שכבר קיימת.

## ${PLAYBOOKS}

## פורמט התשובה — JSON אחד בלבד, ללא טקסט מסביב, ללא code-fence:
{"mode":"clarify|plan|build","message":"<עברית>","questions":["..."],"plan":["..."],"collections":[{"name":"appointments","label":"תורים","fields":[{"key":"day","label":"יום","type":"text"},{"key":"time","label":"שעה","type":"text"},{"key":"status","label":"סטטוס","type":"select","options":["free","taken"]},{"key":"customerName","label":"שם","type":"text"},{"key":"customerPhone","label":"טלפון","type":"text"}],"seedRows":[{"day":"ראשון","time":"10:00","status":"free"},{"day":"ראשון","time":"10:30","status":"free"}]}],"flow":{"nodes":[{"id":"n1","type":"start","data":{}}],"edges":[{"source":"n1","target":"n2","sourceHandle":"true"}]}}
כלול רק את השדות הרלוונטיים ל-mode (collections רק כשבונים flow שמשתמש בטבלה חדשה). "message" תמיד נוכח ובעברית.`;
}

/** Repair instruction appended when a built graph fails validation. */
export function repairPrompt(issues: string): string {
  return `הגרף שבנית לא תקין. תקן את הבעיות הבאות והחזר שוב JSON מלא במצב build:\n${issues}`;
}
