# bootWhat — אינדקס לסוכנים

> מפת ניווט לפרויקט. נטען אוטומטית — קרא אותי קודם, אל תסרוק את כל `src/` (חוסך טוקנים).

## מה זה
פלטפורמת SaaS לבוט WhatsApp עם AI. **רב-לקוחית (multi-tenant)**, TypeScript + Next.js 15 + React 19 + MongoDB.

## 🚨 החלטת-העל
**בונים מחדש מאפס מסביב לאפיון — לא משפרים את הקוד הישן.**
הקוד הישן (`src/lib`, `src/pages/api`, `src/app` הישנים) הוא MVP שרץ בפרודקשן אך הוא **מקור חלקים-שעובדים בלבד**, לא הבסיס. הארכיטקטורה האמיתית: `src/core` + `src/modules`.
⚠️ לא לשבור את הבוט הרץ עד שהנתיב החדש מוכן.

## מפת הקבצים — לאן ללכת
| צריך... | קרא |
|---------|-----|
| **מה נבנה / מה נשאר — snapshot מהיר** | ⭐ [specs/STATUS.md](specs/STATUS.md) — תמונת-מצב מאוחדת (✅/🔶/⬜/🔒) |
| **להמשיך לעבוד / Handoff מפורט** | [specs/IMPLEMENTATION.md](specs/IMPLEMENTATION.md) — §9 Handoff, §7 סטטוס, §6 סדר בנייה, §10 Roadmap |
| האפיון המלא (26 קטגוריות) | [specs/README.md](specs/README.md) + `specs/NN-*.md` |
| מקורות האפיון `[S#]` | [specs/00-sources.md](specs/00-sources.md) |
| תשתית קוד (קיימת ✅) | `src/core/` — config, db/mongo, db/repository, types, tenant |
| מודולי דומיין (בבנייה) | `src/modules/<name>/` — models, repository, service |
| **בוט-AI שבונה תהליכי-שיחה** | [specs/27-ai-flow-architect.md](specs/27-ai-flow-architect.md) — `src/modules/flow-ai/` (catalog+validator+architect) + `/api/flows/ai` + פאנל ב-`dashboard/flows` |
| **לכידת דירות מקבוצות נדל"ן (WRE)** | [specs/29-wre-real-estate.md](specs/29-wre-real-estate.md) — `src/modules/wre/` + `/wre`. §29.5 = ידע **נמדד** על govmap (`filterType` חובה, EPSG:3857, פסי-ציון, למה לא Nominatim) ומלכודות-עברית (`\b` של JS הוא ASCII-בלבד). אל תנחש מחדש |
| **עיצוב-מחדש אזור התהליכים (UI/UX)** | ⭐ [specs/redesign/00-MASTER-REDESIGN.md](specs/redesign/00-MASTER-REDESIGN.md) — מודל 5-בלוקים, הודעה-עשירה, מערכת-טוקנים, ולידציה חיה. §8 = יומן-בנייה (גלים 0–1 ✅). האזור רשאי לשבור את העיצוב הגלובלי |
| מה לקחת מהקוד הישן | IMPLEMENTATION.md §4 (Salvage) |
| תיעוד המערכת הישנה | [DOCUMENTATION.md](DOCUMENTATION.md) (רקע בלבד) |

## מוסכמות
- **Multi-tenant:** כל מודל מרחיב `BaseEntity` (יש `tenantId`); גישת נתונים דרך `Repository<T>` ב-`src/core/db/repository.ts` שמסנן לפי tenant אוטומטית. אל תכתוב שאילתות Mongo ידניות בלי tenant scoping.
- **Tenant resolution:** דרך `src/core/tenant/context.ts` בלבד (כרגע ברירת-מחדל; ה-seam ל-multi-tenant מלא).
- **env:** הכל דרך `src/core/config.ts` (מנקה BOM). אל תקרא `process.env` ישירות במודולים.
- **API:** Route Handlers דקים ב-`src/app/api/` → קוראים ל-`service` במודול. לוגיקה לא ב-controller.
- **בנייה לפי סדר תלויות** (IMPLEMENTATION.md §6), לא לפי מספר קטגוריה.
- **UI:** עברית + RTL. עיצוב קיים ב-`src/app/globals.css`.

## בדיקה
`npx tsc --noEmit` חייב לעבור לפני סיום. `MONGODB_URI` נדרש רק לחיבור חי (הקוד lazy — לא חוסם פיתוח/typecheck).

## בסוף כל סשן
עדכן את **IMPLEMENTATION.md §9 (Handoff)** ואת **§8 (יומן)**.
