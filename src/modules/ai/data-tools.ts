/**
 * AI ↔ data platform bridge — [קטגוריה 28 → 10].
 *
 * Exposes every tenant data table ([28]) to the AI agent as Claude tools, derived
 * live from the table schema (no manual Action registration needed). Read access
 * yields find/aggregate; write access adds insert/update/increment. Execution is
 * delegated to the shared `runBuiltin` so flows, the API and the AI all run the
 * same code path.
 */
import type { ToolSpec, ToolCall } from "./provider";
import { runBuiltin } from "@/modules/actions/builtins";
import * as data from "@/modules/data";
import type { CollectionDef, FieldType } from "@/modules/data";

const READ_OPS = ["find", "aggregate"] as const;
const WRITE_OPS = ["insert", "update", "increment"] as const;
type DataOp = (typeof READ_OPS)[number] | (typeof WRITE_OPS)[number];

function jsonType(t: FieldType): "string" | "number" | "boolean" {
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  return "string";
}

/** A JSON-Schema `properties` map describing one row of this table, for the LLM. */
function rowProps(c: CollectionDef): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const f of c.fields) {
    props[f.key] = {
      type: jsonType(f.type),
      description: f.label + (f.options?.length ? ` (אפשרויות: ${f.options.join(", ")})` : ""),
    };
  }
  return props;
}

const WHERE_SCHEMA = {
  type: "object" as const,
  description: "תנאי סינון פשוטים: { שדה: ערך } להתאמה מדויקת (AND ביניהם).",
  additionalProperties: true,
};

/** Build the tool specs for one collection, honoring its aiAccess level. */
function toolsForCollection(c: CollectionDef): ToolSpec[] {
  const access = c.aiAccess ?? "read";
  if (access === "none") return [];
  const tools: ToolSpec[] = [];

  tools.push({
    name: `data_find_${c.name}`,
    description: `חפש/קרא רשומות מהטבלה "${c.label}". מחזיר מערך רשומות תואמות.`,
    inputSchema: {
      type: "object",
      properties: {
        where: WHERE_SCHEMA,
        limit: { type: "number", description: "מספר תוצאות מרבי (ברירת מחדל: הכל)." },
      },
    },
  });

  tools.push({
    name: `data_aggregate_${c.name}`,
    description: `חשב סיכום על "${c.label}" — ספירה/סכום/ממוצע/מינ/מקס, עם קיבוץ אופציונלי.`,
    inputSchema: {
      type: "object",
      properties: {
        where: WHERE_SCHEMA,
        metric: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
        field: { type: "string", description: "שדה מספרי ל-sum/avg/min/max." },
        groupBy: { type: "string", description: "שדה לקיבוץ (אופציונלי)." },
      },
    },
  });

  if (access === "write") {
    tools.push({
      name: `data_insert_${c.name}`,
      description: `הוסף רשומה חדשה לטבלה "${c.label}".`,
      inputSchema: { type: "object", properties: rowProps(c) },
    });
    tools.push({
      name: `data_update_${c.name}`,
      description: `עדכן רשומות ב-"${c.label}". העבר id לעדכון רשומה אחת, או where לעדכון לפי תנאי.`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "מזהה רשומה לעדכון בודד." },
          where: WHERE_SCHEMA,
          data: { type: "object", description: "השדות לעדכון.", additionalProperties: true },
        },
      },
    });
    tools.push({
      name: `data_increment_${c.name}`,
      description: `שנה אטומית שדה מספרי ב-"${c.label}" (למשי מלאי). amount שלילי לגריעה; נכשל אם יורד מתחת ל-0.`,
      inputSchema: {
        type: "object",
        properties: {
          where: WHERE_SCHEMA,
          field: { type: "string", description: "השדה המספרי." },
          amount: { type: "number", description: "כמות לשינוי (יכול להיות שלילי)." },
        },
        required: ["field", "amount"],
      },
    });
  }
  return tools;
}

/** All data tools for the tenant, derived from current table schemas. */
export async function buildDataTools(tenantId: string): Promise<ToolSpec[]> {
  const collections = await data.listCollections(tenantId);
  return collections.flatMap(toolsForCollection);
}

export function isDataTool(name: string): boolean {
  return /^data_(find|aggregate|insert|update|increment)_/.test(name);
}

/** Execute a data tool call, enforcing the collection's write permission. */
export async function executeDataTool(tenantId: string, call: ToolCall): Promise<string> {
  const collections = await data.listCollections(tenantId);
  for (const c of collections) {
    for (const op of [...READ_OPS, ...WRITE_OPS] as DataOp[]) {
      if (call.name !== `data_${op}_${c.name}`) continue;
      const access = c.aiAccess ?? "read";
      if ((WRITE_OPS as readonly string[]).includes(op) && access !== "write") {
        return `error: write to "${c.label}" is not permitted for the agent`;
      }
      try {
        const out = await runBuiltin(tenantId, `data.${op}`, { collection: c.name }, call.input);
        return typeof out === "string" ? out : JSON.stringify(out ?? {});
      } catch (err) {
        return `error: ${String(err)}`;
      }
    }
  }
  return `error: unknown data tool "${call.name}"`;
}
