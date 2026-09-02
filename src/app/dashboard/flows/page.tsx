"use client";

/**
 * Flow Builder ([קטגוריה 8]) — visual canvas exposing ALL engine node types.
 * Decoupled from the legacy lib; persists the BuilderFlow shape to /api/flows.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Handle, Position, MarkerType,
  type Node, type Edge, type Connection, type NodeTypes, type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { validateGraph, type Graph as ValidationGraph, type ValidationResult } from "@/modules/flow-ai/validator";
import {
  Plus, ArrowRight, Trash2, Save, ToggleLeft, ToggleRight, Edit2, Info, LayoutGrid,
  Zap, MessageSquare, GitBranch, HelpCircle, GitFork, Tag, FileText,
  Wrench, Bot, Clock, Ban, CheckCircle2, Edit3, Headphones,
  Image as ImageIcon, Globe, ShieldCheck, Share2,
  List, Network, Variable, Sparkles, ScanText, CalendarCheck, Code2, Database,
  MapPin, Shuffle, IterationCcw, Timer,
  Send, Wand2, Loader2, AlertTriangle, X, Check,
  Moon, Sun, Undo2, Redo2, Smartphone, ChevronDown, ChevronLeft, Compass,
  History, RotateCcw, MessagesSquare, Plus as PlusIcon,
} from "lucide-react";

// ── Node catalog (all 29 engine node types) ───────────────────────
type NodeKind =
  | "start" | "message" | "buttons" | "list" | "template" | "media" | "location"
  | "question" | "wait_reply" | "condition" | "switch" | "split" | "delay" | "validate"
  | "set_field" | "set_var" | "data" | "tag" | "action" | "api" | "run_code"
  | "ai" | "ai_classify" | "ai_extract" | "handoff" | "appointment"
  | "jump" | "jump_to_node" | "stop" | "end";

/**
 * Flow class drives the node's 3px state-rail (NOT a per-type color). Type is
 * signaled by glyph + label; color is reserved for flow meaning + signal only
 * (redesign §02 §4.1) — this is what kills the old rainbow.
 */
type FlowClass = "trigger" | "terminal" | "branch" | "action";

interface NodeDef {
  type: NodeKind;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  flowClass: FlowClass;
  group: string;
}

const NODE_DEFS: NodeDef[] = [
  { type: "start", label: "התחלה", icon: Zap, flowClass: "trigger", group: "התחלה וסיום" },
  { type: "end", label: "סיום", icon: CheckCircle2, flowClass: "terminal", group: "התחלה וסיום" },
  { type: "stop", label: "עצירה", icon: Ban, flowClass: "terminal", group: "התחלה וסיום" },
  { type: "jump_to_node", label: "קפיצה לצומת", icon: IterationCcw, flowClass: "action", group: "התחלה וסיום" },
  { type: "message", label: "הודעת טקסט", icon: MessageSquare, flowClass: "action", group: "הודעות" },
  { type: "buttons", label: "כפתורי בחירה", icon: GitBranch, flowClass: "branch", group: "הודעות" },
  { type: "list", label: "רשימת בחירה", icon: List, flowClass: "branch", group: "הודעות" },
  { type: "media", label: "מדיה (תמונה/קובץ)", icon: ImageIcon, flowClass: "action", group: "הודעות" },
  { type: "location", label: "שליחת מיקום", icon: MapPin, flowClass: "action", group: "הודעות" },
  { type: "template", label: "תבנית מאושרת", icon: FileText, flowClass: "action", group: "הודעות" },
  { type: "question", label: "שאלה ושמירה", icon: HelpCircle, flowClass: "action", group: "קלט ולוגיקה" },
  { type: "wait_reply", label: "המתנה לתשובה", icon: Timer, flowClass: "branch", group: "קלט ולוגיקה" },
  { type: "validate", label: "ולידציה", icon: ShieldCheck, flowClass: "branch", group: "קלט ולוגיקה" },
  { type: "condition", label: "תנאי (if/else)", icon: GitFork, flowClass: "branch", group: "קלט ולוגיקה" },
  { type: "switch", label: "פיצול לפי ערך", icon: Network, flowClass: "branch", group: "קלט ולוגיקה" },
  { type: "split", label: "פיצול אקראי (A/B)", icon: Shuffle, flowClass: "branch", group: "קלט ולוגיקה" },
  { type: "delay", label: "המתנה", icon: Clock, flowClass: "action", group: "קלט ולוגיקה" },
  { type: "set_field", label: "עדכון שדה", icon: Edit3, flowClass: "action", group: "נתונים ופעולות" },
  { type: "set_var", label: "חישוב משתנה", icon: Variable, flowClass: "action", group: "נתונים ופעולות" },
  { type: "data", label: "טבלת נתונים", icon: Database, flowClass: "action", group: "נתונים ופעולות" },
  { type: "tag", label: "תגית", icon: Tag, flowClass: "action", group: "נתונים ופעולות" },
  { type: "action", label: "פעולה (Action)", icon: Wrench, flowClass: "action", group: "נתונים ופעולות" },
  { type: "api", label: "קריאת API", icon: Globe, flowClass: "action", group: "נתונים ופעולות" },
  { type: "run_code", label: "הרצת קוד (JS)", icon: Code2, flowClass: "action", group: "נתונים ופעולות" },
  { type: "ai", label: "תגובת AI", icon: Bot, flowClass: "action", group: "AI ותפעול" },
  { type: "ai_classify", label: "סיווג כוונה (AI)", icon: Sparkles, flowClass: "branch", group: "AI ותפעול" },
  { type: "ai_extract", label: "חילוץ ישויות (AI)", icon: ScanText, flowClass: "action", group: "AI ותפעול" },
  { type: "handoff", label: "העברה לנציג", icon: Headphones, flowClass: "action", group: "AI ותפעול" },
  { type: "appointment", label: "קביעת תור", icon: CalendarCheck, flowClass: "branch", group: "AI ותפעול" },
  { type: "jump", label: "מעבר לתהליך", icon: Share2, flowClass: "action", group: "AI ותפעול" },
];

// ── Author blocks (redesign §01 §2.2) ─────────────────────────────
// The palette no longer dumps 29 engine primitives. The author composes in 5
// *intents*; each block compiles to the SAME engine nodes the runtime already
// runs (authoring-only — nothing lost, see §2.9 before→after). The engine type
// a node carries is the source of truth; `data.authorBlock` only remembers which
// block the human used so the inspector reopens in the right shape.
type BlockId = "message" | "ask" | "decide" | "do" | "route";

interface SubType { type: NodeKind; label: string; hint?: string }
interface BlockDef {
  id: BlockId;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;       // signal tint for the palette chip / inspector header
  desc: string;
  /** Engine type dropped when this block is first added. */
  seed: NodeKind;
  /** Sub-types chosen *inside* the block (empty for Message — it's the composer). */
  subtypes: SubType[];
}

const BLOCKS: BlockDef[] = [
  {
    id: "message", label: "הודעה", icon: MessageSquare, accent: "var(--c-brand)",
    desc: "אמירה ללקוח — טקסט, תמונה, כפתורים או תפריט, כהודעה אחת",
    seed: "message", subtypes: [],
  },
  {
    id: "ask", label: "שאלה ללקוח", icon: HelpCircle, accent: "var(--c-info)",
    desc: "שאל את הלקוח ושמור את התשובה",
    seed: "question", subtypes: [
      { type: "question", label: "תשובה חופשית (טקסט)" },
      { type: "buttons", label: "בחירה מכפתורים (2–3)" },
      { type: "list", label: "בחירה מתפריט (עד 10)" },
      { type: "wait_reply", label: "המתנה עם פסק-זמן" },
    ],
  },
  {
    id: "decide", label: "החלטה / פיצול", icon: GitFork, accent: "var(--c-warning)",
    desc: "נתב את השיחה למסלולים שונים",
    seed: "condition", subtypes: [
      { type: "condition", label: "לפי תשובה / פרט" },
      { type: "switch", label: "לפי ערך — כמה ענפים" },
      { type: "ai_classify", label: "תן ל-AI להבין כוונה" },
      { type: "split", label: "פיצול אקראי (A/B)" },
    ],
  },
  {
    id: "do", label: "פעולה", icon: Zap, accent: "var(--c-neutral-600)",
    desc: "עשה משהו ברקע, בלי שהלקוח רואה",
    seed: "set_field", subtypes: [
      { type: "set_field", label: "זכור פרט על הלקוח" },
      { type: "data", label: "טבלת נתונים — קרא/כתוב" },
      { type: "tag", label: "הוסף / הסר תגית" },
      { type: "action", label: "הרץ פעולה עסקית" },
      { type: "ai_extract", label: "חלץ פרטים מהטקסט (AI)" },
      { type: "delay", label: "המתן זמן מה" },
      { type: "api", label: "קריאה למערכת חיצונית (API)" },
    ],
  },
  {
    id: "route", label: "ניתוב", icon: Compass, accent: "var(--c-neutral-700)",
    desc: "העבר לנציג, קפוץ או סיים",
    seed: "handoff", subtypes: [
      { type: "handoff", label: "העבר לנציג אנושי" },
      { type: "appointment", label: "קבע תור" },
      { type: "ai", label: "תשובת AI חופשית מהידע" },
      { type: "jump", label: "המשך לתהליך אחר" },
      { type: "jump_to_node", label: "חזור לשלב קודם" },
      { type: "end", label: "סיים שיחה" },
    ],
  },
];

// The Advanced drawer (§2.8) — power-user primitives, hidden by default.
const ADVANCED_SUBTYPES: SubType[] = [
  { type: "set_var", label: "חישוב משתנה (גולמי)" },
  { type: "validate", label: "ולידציה (regex/אורך)" },
  { type: "run_code", label: "הרצת קוד JS" },
  { type: "location", label: "שליחת מיקום" },
  { type: "template", label: "תבנית מאושרת" },
  { type: "stop", label: "עצירה שקטה" },
];

const BLOCK_BY_ID = new Map<BlockId, BlockDef>(BLOCKS.map((b) => [b.id, b]));

// Map an engine type → its default author block (buttons/list default to Message;
// the Ask block re-tags them via data.authorBlock when it authors them).
const TYPE_TO_BLOCK: Record<string, BlockId> = {
  message: "message", media: "message", buttons: "message", list: "message", location: "message", template: "message",
  question: "ask", wait_reply: "ask", validate: "ask",
  condition: "decide", switch: "decide", split: "decide", ai_classify: "decide",
  set_field: "do", set_var: "do", data: "do", tag: "do", action: "do", api: "do", ai_extract: "do", delay: "do", run_code: "do",
  handoff: "route", appointment: "route", jump: "route", jump_to_node: "route", ai: "route", end: "route", stop: "route",
};

function blockForNode(type: string, data: NodeData): BlockId {
  const tagged = data.authorBlock as BlockId | undefined;
  if (tagged && BLOCK_BY_ID.has(tagged)) return tagged;
  return TYPE_TO_BLOCK[type] ?? "do";
}

// ── Humane vocabularies (redesign §4) ─────────────────────────────
// Engine enums never reach the author; these are the Hebrew surfaces over them.
const HEB_OPS: { value: string; label: string }[] = [
  { value: "eq", label: "שווה ל" },
  { value: "neq", label: "לא שווה ל" },
  { value: "contains", label: "מכיל" },
  { value: "gt", label: "גדול מ" },
  { value: "lt", label: "קטן מ" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
];

/** Humane presets → known-good regex (§4.6). The raw regex box survives in Advanced. */
const VALIDATE_PRESETS: { value: string; label: string; regex?: string }[] = [
  { value: "any", label: "טקסט חופשי" },
  { value: "email", label: "אימייל", regex: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
  { value: "phone_il", label: "טלפון ישראלי", regex: "^0\\d{8,9}$" },
  { value: "number", label: "מספר", regex: "^-?\\d+(\\.\\d+)?$" },
  { value: "date", label: "תאריך", regex: "^\\d{1,2}[./]\\d{1,2}([./]\\d{2,4})?$" },
];

/** Variable "memories" the author can pick instead of re-typing dotted paths (§4.3). */
const MEMORY_BUILTINS: { value: string; label: string }[] = [
  { value: "message.text", label: "ההודעה האחרונה של הלקוח" },
  { value: "contact.firstName", label: "שם פרטי" },
  { value: "contact.phone", label: "טלפון" },
];

/** Scan the graph for named memories the author created (question/set/extract/...). */
function collectMemories(nodes: Node<NodeData>[]): string[] {
  const set = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && v.trim()) set.add(v.trim()); };
  for (const n of nodes) {
    const d = n.data as NodeData;
    if (n.type === "question" || n.type === "wait_reply" || n.type === "set_field") add(d.field);
    if (n.type === "set_var") add(d.target);
    if (n.type === "ai_classify" || n.type === "api" || n.type === "action" || n.type === "run_code") add(d.outputKey);
    if (n.type === "ai_extract") for (const f of ((d.fields as Array<{ key: string }>) ?? [])) add(f.key);
  }
  return [...set];
}

/** "Insert a detail" chips — write the {{...}} token the engine's interpolate already reads. */
const DETAIL_CHIPS: { token: string; label: string }[] = [
  { token: "{{contact.firstName}}", label: "שם פרטי" },
  { token: "{{contact.lastName}}", label: "שם משפחה" },
  { token: "{{contact.phone}}", label: "טלפון" },
];

// ── Message composer ⇄ engine (redesign §2.3) ─────────────────────
// One "Message" block is authored as parts (header / body / interactive / footer)
// and compiled to the minimum valid WhatsApp envelope — ideally ONE engine node.
type HeaderKind = "none" | "text" | "image" | "video" | "document";
type MsgInteractive = "none" | "buttons" | "list";
type MsgMode = "rich" | "location" | "template";

/** Derive the engine type + engine-consumed data from the authored Message parts. */
function normalizeMessage(d: NodeData): { type: NodeKind; data: NodeData } {
  const mode = (d.msgMode as MsgMode) ?? "rich";
  const text = (d.text as string) ?? "";
  const headerKind = (d.headerKind as HeaderKind) ?? "none";
  const interactive = (d.interactive as MsgInteractive) ?? "none";
  const base: NodeData = { ...d, authorBlock: "message", msgMode: mode };

  if (mode === "location") return { type: "location", data: base };
  if (mode === "template") return { type: "template", data: base };

  // structured header object the buttons-engine reads (§6.2A)
  let header: NodeData | undefined;
  if (headerKind === "text" && d.headerText) header = { kind: "text", text: d.headerText };
  else if ((headerKind === "image" || headerKind === "video") && d.headerLink) header = { kind: headerKind, link: d.headerLink };
  else if (headerKind === "document" && d.headerLink) header = { kind: "document", link: d.headerLink, filename: d.headerFilename };

  if (interactive === "buttons") return { type: "buttons", data: { ...base, header, footer: d.footer } };
  if (interactive === "list") {
    const listHeader = headerKind === "text" && d.headerText ? { kind: "text", text: d.headerText } : undefined;
    return { type: "list", data: { ...base, header: listHeader, footer: d.footer } };
  }
  if (headerKind !== "none" && headerKind !== "text") {
    // media-only message: image/video/document carries the body as its caption
    return { type: "media", data: { ...base, mediaKind: headerKind, link: d.headerLink ?? "", caption: text || undefined, filename: d.headerFilename } };
  }
  return { type: "message", data: { ...base, text } };
}

/** Reverse: open any message-family engine node back into the composer's part fields. */
function hydrateMessage(type: string, d: NodeData): NodeData {
  if (d.msgMode || d.headerKind || d.interactive) return { ...d, authorBlock: "message" };
  const out: NodeData = { ...d, authorBlock: "message", msgMode: "rich", headerKind: "none", interactive: "none" };
  if (type === "location") out.msgMode = "location";
  else if (type === "template") out.msgMode = "template";
  else if (type === "media") {
    out.headerKind = (d.mediaKind as string) ?? "image";
    out.headerLink = (d.link as string) ?? "";
    out.headerFilename = d.filename;
    out.text = (d.caption as string) ?? "";
  } else if (type === "buttons") {
    out.interactive = "buttons";
    const h = d.header as { kind?: string; text?: string; link?: string; filename?: string } | undefined;
    if (h?.kind) { out.headerKind = h.kind; out.headerText = h.text; out.headerLink = h.link; out.headerFilename = h.filename; }
  } else if (type === "list") {
    out.interactive = "list";
    const h = d.header as { kind?: string; text?: string } | undefined;
    if (h?.kind === "text") { out.headerKind = "text"; out.headerText = h.text; }
  }
  return out;
}

/** Honest envelope summary: how many WhatsApp messages the composer will send. */
function envelopeNote(d: NodeData): { ok: boolean; text: string } {
  const headerKind = (d.headerKind as HeaderKind) ?? "none";
  const interactive = (d.interactive as MsgInteractive) ?? "none";
  if (interactive === "list" && headerKind !== "none" && headerKind !== "text") {
    return { ok: false, text: "יישלח כ-2 הודעות: התמונה, ואז התפריט (תפריט לא תומך בתמונה בכותרת)" };
  }
  if (headerKind === "image" || headerKind === "video" || headerKind === "document") {
    return { ok: true, text: "נשלח כהודעה אחת (מדיה + טקסט" + (interactive === "buttons" ? " + כפתורים)" : ")") };
  }
  return { ok: true, text: "נשלח כהודעה אחת" };
}

// The node's 3px state-rail signals what it does to the FLOW (entry / split /
// exit), not which category it belongs to — so the canvas reads operationally
// instead of as a rainbow (redesign §02 §4.1).
const RAIL_COLORS: Record<FlowClass, string> = {
  trigger: "var(--c-brand)",      // entry point — allowed to glow
  terminal: "var(--fg-dim)",      // an ending
  branch: "var(--c-neutral-400)", // forks the conversation
  action: "var(--node-rail)",     // a silent step on the spine
};
const railColor = (fc: FlowClass) => RAIL_COLORS[fc];
// Minimap renders to SVG where CSS vars don't resolve — needs literal hex.
const railHex = (fc: FlowClass) =>
  fc === "trigger" ? "#128C7E" : fc === "terminal" ? "#94A3B8" : "#CBD5E1";

const NEUTRAL_HANDLE = "#94A3B8";
const handleStyle = (color: string): React.CSSProperties => ({
  background: "#fff",
  border: `2px solid ${color}`,
  width: 10,
  height: 10,
});

function defFor(type: string): NodeDef {
  return NODE_DEFS.find((d) => d.type === type) ?? NODE_DEFS[3];
}

// ── Types ──────────────────────────────────────────────────────────
type NodeData = Record<string, unknown>;
interface ButtonOpt { id: string; label: string }
interface RowOpt { id: string; title: string; description?: string }
interface CaseOpt { value: string; handle: string }
interface SplitOpt { handle: string; weight: number; label: string }
interface BuilderFlowT {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: NodeData }>;
  edges: Array<{ id: string; source: string; sourceHandle: string | null; target: string; targetHandle: string | null }>;
}
interface ActionOpt { id: string; name: string }
interface TemplateOpt { name: string; language: string }
interface FlowOpt { id: string; name: string }
interface ResourceOpt { id: string; name: string }
interface CollectionField { key: string; label: string; type: string; options?: string[] }
interface CollectionOpt { id: string; name: string; label: string; fields: CollectionField[] }

// ── Branch handles per node type ──────────────────────────────────
function branchesFor(type: string, data: NodeData): { id: string; label: string; color: string }[] {
  if (type === "end" || type === "stop" || type === "jump_to_node") return [];
  if (type === "split") {
    const branches = (data.branches as SplitOpt[]) ?? [];
    return branches.length
      ? branches.map((b) => ({ id: b.handle, label: `${b.label || "וריאנט"} ${b.weight}%`, color: NEUTRAL_HANDLE }))
      : [{ id: "output", label: "", color: "#94A3B8" }];
  }
  if (type === "buttons") {
    const btns = (data.buttons as ButtonOpt[]) ?? [];
    return btns.length ? btns.map((b) => ({ id: b.id, label: b.label || "כפתור", color: NEUTRAL_HANDLE })) : [{ id: "output", label: "", color: NEUTRAL_HANDLE }];
  }
  if (type === "list") {
    const rows = (data.rows as RowOpt[]) ?? [];
    return rows.length ? rows.map((r) => ({ id: r.id, label: r.title || "פריט", color: NEUTRAL_HANDLE })) : [{ id: "output", label: "", color: NEUTRAL_HANDLE }];
  }
  if (type === "switch" || type === "ai_classify") {
    const cases = (data.cases as CaseOpt[]) ?? [];
    return [...cases.map((c) => ({ id: c.handle, label: c.value || "?", color: NEUTRAL_HANDLE })), { id: "default", label: "אחר", color: NEUTRAL_HANDLE }];
  }
  if (type === "condition") return [{ id: "true", label: "כן", color: "#16A34A" }, { id: "false", label: "לא", color: "#DC2626" }];
  if (type === "action" || type === "api") return [{ id: "success", label: "הצלחה", color: "#16A34A" }, { id: "error", label: "שגיאה", color: "#DC2626" }];
  if (type === "appointment") return [{ id: "success", label: "נקבע", color: "#16A34A" }, { id: "error", label: "נכשל", color: "#DC2626" }];
  if (type === "run_code") return [{ id: "success", label: "הצלחה", color: "#16A34A" }, { id: "error", label: "שגיאה", color: "#DC2626" }];
  if (type === "validate") return [{ id: "valid", label: "תקין", color: "#16A34A" }, { id: "invalid", label: "לא תקין", color: "#DC2626" }];
  if (type === "wait_reply") return [{ id: "reply", label: "ענה", color: "#16A34A" }, { id: "timeout", label: "לא ענה", color: "#DC2626" }];
  if (type === "data") {
    const op = String(data.op ?? "find");
    return op === "find" || op === "get" || op === "aggregate"
      ? [{ id: "found", label: "נמצא", color: "#16A34A" }, { id: "empty", label: "ריק", color: "#DC2626" }]
      : [{ id: "success", label: "הצלחה", color: "#16A34A" }, { id: "error", label: "שגיאה", color: "#DC2626" }];
  }
  if (type === "jump") return [{ id: "error", label: "נכשל", color: "#DC2626" }];
  return [{ id: "output", label: "", color: "#94A3B8" }];
}

function summaryFor(type: string, data: NodeData): string {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  switch (type) {
    case "start": return `הפעלה: ${s("keyword") || "(לא הוגדר)"}`;
    case "message": case "ai": case "end": return s("text") || (type === "ai" ? "AI עונה לפי הידע" : "(ריק)");
    case "buttons": return s("text") || "בחר אפשרות";
    case "list": return s("text") || `רשימה · ${((data.rows as RowOpt[]) ?? []).length} פריטים`;
    case "switch": return `${s("field") || "שדה"} → ${((data.cases as CaseOpt[]) ?? []).length} ענפים`;
    case "split": return `פיצול אקראי · ${((data.branches as SplitOpt[]) ?? []).length} וריאנטים`;
    case "jump_to_node": return s("targetNodeLabel") ? `↺ ${s("targetNodeLabel")}` : "(בחר צומת יעד)";
    case "location": return s("name") || s("address") || "📍 מיקום";
    case "set_var": return `${s("target") || "משתנה"} = ${s("value") || ""}${s("transform") && s("transform") !== "none" ? ` (${s("transform")})` : ""}`;
    case "data": return `${DATA_OP_LABELS[s("op")] ?? "נתונים"} · ${s("collection") || "(בחר טבלה)"}`;
    case "ai_classify": return `סיווג כוונה → ${((data.cases as CaseOpt[]) ?? []).length} ענפים`;
    case "ai_extract": return `חילוץ ${((data.fields as Array<{ key: string }>) ?? []).length} שדות`;
    case "media": return `${mediaKindLabel(s("mediaKind") || s("kind"))}${s("caption") ? ` · ${s("caption")}` : ""}`;
    case "template": return s("name") ? `תבנית: ${s("name")}` : "(בחר תבנית)";
    case "validate": return `בדוק ${s("field") || "message.text"}${validateRuleHint(data)}`;
    case "api": return `${(s("method") || "GET").toUpperCase()} ${s("url") || "(הזן כתובת)"}`;
    case "jump": return s("targetFlowName") ? `→ ${s("targetFlowName")}` : "(בחר תהליך יעד)";
    case "question": return `${s("text") || "שאלה"} → ${s("field") || "שדה"}`;
    case "wait_reply": return `המתנה לתשובה · ${Number(data.timeoutMinutes ?? 0)} ד׳`;
    case "condition": return `${s("condField") || "שדה"} ${s("condOp") || "="} ${s("condValue") || ""}`;
    case "delay": return `המתנה ${String(data.minutes ?? 0)} דקות`;
    case "set_field": return `${s("field") || "שדה"} = ${s("value") || ""}`;
    case "tag": return `${data.op === "remove" ? "הסר" : "הוסף"} תגית: ${s("tag") || ""}`;
    case "action": return s("actionLabel") || "(בחר פעולה)";
    case "run_code": return s("code") ? s("code").split("\n")[0].slice(0, 32) : "קוד JS מותאם";
    case "handoff": return `סיבה: ${s("reason") || "customer_request"}`;
    case "appointment": return s("resourceName") ? `תור: ${s("resourceName")}` : "(בחר משאב)";
    case "stop": return "עצירת הזרימה";
    default: return "";
  }
}

const MEDIA_KINDS = [
  { value: "image", label: "תמונה" },
  { value: "video", label: "וידאו" },
  { value: "audio", label: "אודיו" },
  { value: "document", label: "מסמך" },
];

// Data-node operations ([קטגוריה 28]) — Hebrew surfaces over the engine ops.
const DATA_OPS: { value: string; label: string }[] = [
  { value: "find", label: "חיפוש שורות" },
  { value: "get", label: "שליפת שורה אחת" },
  { value: "aggregate", label: "חישוב סיכום (ספירה/סכום…)" },
  { value: "insert", label: "הוספת שורה" },
  { value: "update", label: "עדכון שורות" },
  { value: "delete", label: "מחיקת שורות" },
  { value: "increment", label: "עדכון מונה (±)" },
];
const DATA_METRICS: { value: string; label: string }[] = [
  { value: "count", label: "ספירה" }, { value: "sum", label: "סכום" }, { value: "avg", label: "ממוצע" }, { value: "min", label: "מינימום" }, { value: "max", label: "מקסימום" },
];
const DATA_OP_LABELS: Record<string, string> = Object.fromEntries(DATA_OPS.map((o) => [o.value, o.label]));
function mediaKindLabel(kind: string): string {
  return MEDIA_KINDS.find((k) => k.value === kind)?.label ?? "מדיה";
}
function validateRuleHint(data: NodeData): string {
  const parts: string[] = [];
  if (data.required) parts.push("חובה");
  if (typeof data.regex === "string" && data.regex) parts.push("regex");
  if (typeof data.minLength === "number" || typeof data.maxLength === "number") parts.push("אורך");
  return parts.length ? ` · ${parts.join(", ")}` : "";
}

// ── Live validation ([קטגוריה 27] §5) ────────────────────────────
// The deterministic validator already exists (src/modules/flow-ai/validator.ts);
// the canvas just never called it. We run it live and surface per-node levels
// through context so nodes light up without touching React-Flow's node state.
const ValidationContext = createContext<Map<string, "error" | "warning">>(new Map());

function toValidationGraph(nodes: Node<NodeData>[], edges: Edge[]): ValidationGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: (n.type as string) ?? "message", data: stripPos(n.data) })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

// Lets a node ask the builder to add+wire a next step off one of its branches
// (the visible "+ הוסף שלב" affordance — replaces drag-from-a-10px-dot, §3.3).
const AddStepContext = createContext<((nodeId: string, handle: string) => void) | null>(null);

const MEDIA_GLYPH: Record<string, string> = { image: "🖼️", video: "🎬", audio: "🎧", document: "📄" };

/** A small WhatsApp-style bubble — the node body shows the message as the customer sees it. */
function MiniBubble({ type, data }: { type: string; data: NodeData }) {
  const d = data;
  const body = type === "media" ? String(d.caption ?? "") : String(d.text ?? "");
  const headerKind = (d.headerKind as string) ?? (type === "media" ? String(d.mediaKind ?? "image") : "none");
  const mediaHeader = headerKind === "image" || headerKind === "video" || headerKind === "document";
  const link = (d.headerLink as string) ?? (d.link as string) ?? "";
  const buttons = (d.buttons as ButtonOpt[]) ?? [];
  const rows = (d.rows as RowOpt[]) ?? [];
  return (
    <div style={{ background: "var(--c-brand-50)", border: "1px solid var(--c-brand-100)", borderRadius: 10, borderTopRightRadius: 3, padding: 7, display: "flex", flexDirection: "column", gap: 5 }}>
      {mediaHeader && (
        link && headerKind === "image"
          ? <div style={{ height: 46, borderRadius: 6, backgroundImage: `url(${link})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          : <div style={{ height: 38, borderRadius: 6, background: "var(--c-neutral-150)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{MEDIA_GLYPH[headerKind] ?? "🖼️"}</div>
      )}
      {body && <div style={{ fontSize: 11.5, color: "var(--fg-primary)", lineHeight: 1.4, maxHeight: 42, overflow: "hidden", whiteSpace: "pre-wrap" }}>{body}</div>}
      {!body && !mediaHeader && <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>(הודעה ריקה)</div>}
      {d.footer ? <div style={{ fontSize: 9.5, color: "var(--fg-muted)" }}>{String(d.footer)}</div> : null}
      {type === "buttons" && buttons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 1 }}>
          {buttons.slice(0, 3).map((b) => <div key={b.id} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "var(--c-brand)", background: "var(--c-neutral-0)", borderRadius: 6, padding: "3px 0", border: "1px solid var(--c-brand-100)" }}>{b.label || "כפתור"}</div>)}
        </div>
      )}
      {type === "list" && rows.length > 0 && (
        <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "var(--c-brand)", background: "var(--c-neutral-0)", borderRadius: 6, padding: "3px 0", border: "1px solid var(--c-brand-100)", marginTop: 1 }}>☰ {String(d.buttonLabel ?? "בחר")} ({rows.length})</div>
      )}
    </div>
  );
}

// ── Generic node renderer ─────────────────────────────────────────
const MSG_FAMILY = new Set(["message", "buttons", "list", "media", "location", "template"]);

function GenericNode({ id, type, data, selected }: NodeProps) {
  const def = defFor(type);
  const Icon = def.icon;
  const branches = branchesFor(type, data as NodeData);
  const issueLevel = useContext(ValidationContext).get(id);
  const onAddStep = useContext(AddStepContext);
  const rail = railColor(def.flowClass);
  const multi = branches.length > 1;
  const isMsg = MSG_FAMILY.has(type) && type !== "location" && type !== "template";
  const summary = summaryFor(type, data as NodeData);
  return (
    <div style={{
      position: "relative",
      background: "var(--node-bg)",
      border: `1px solid ${issueLevel === "error" ? "var(--c-danger)" : selected ? "var(--c-brand)" : "var(--node-border)"}`,
      borderRadius: "var(--radius-lg)",
      width: 216,
      boxShadow: selected ? "var(--elev-2)" : "var(--elev-1)",
      paddingBottom: multi ? 22 : 8,
      transition: "box-shadow var(--dur-fast), border-color var(--dur-fast)",
    }}>
      {/* state-rail: signals trigger/branch/terminal/action — replaces the pastel icon-chip */}
      <span aria-hidden style={{ position: "absolute", top: 8, bottom: 8, right: 6, width: 3, borderRadius: 3, background: issueLevel === "error" ? "var(--c-danger)" : rail }} />
      {issueLevel && (
        <span title={issueLevel === "error" ? "יש בעיה שחוסמת פרסום" : "אזהרה"}
          style={{ position: "absolute", top: -7, left: -7, width: 18, height: 18, borderRadius: "50%", background: issueLevel === "error" ? "var(--c-danger)" : "var(--c-warning)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--elev-1)" }}>
          <AlertTriangle size={11} color="#fff" />
        </span>
      )}
      {type !== "start" && <Handle type="target" position={Position.Top} style={handleStyle(NEUTRAL_HANDLE)} />}
      <div style={{ padding: "9px 13px 9px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMsg || summary ? 7 : 0 }}>
          <Icon size={15} color="var(--fg-secondary)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{def.label}</span>
        </div>
        {isMsg
          ? <MiniBubble type={type} data={data as NodeData} />
          : summary && <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, maxHeight: 44, overflow: "hidden" }}>{summary}</div>}
      </div>
      {branches.map((b, i) => {
        const left = `${((i + 1) / (branches.length + 1)) * 100}%`;
        const labelColor = b.color === NEUTRAL_HANDLE ? "var(--text-muted)" : b.color;
        return (
          <div key={b.id}>
            {b.label && (
              <span style={{ position: "absolute", bottom: 5, left, transform: "translateX(-50%)", fontSize: 11, fontWeight: 500, color: labelColor, whiteSpace: "nowrap" }}>{b.label}</span>
            )}
            {onAddStep && (
              <button title="הוסף שלב מהענף הזה" onClick={(e) => { e.stopPropagation(); onAddStep(id, b.id); }}
                style={{ position: "absolute", bottom: -11, left, transform: "translateX(-50%)", width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border-strong)", background: "var(--node-bg)", color: "var(--fg-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 2 }}>
                <Plus size={10} />
              </button>
            )}
            <Handle type="source" position={Position.Bottom} id={b.id} style={{ ...handleStyle(b.color), left }} />
          </div>
        );
      })}
    </div>
  );
}

const nodeTypes: NodeTypes = Object.fromEntries(
  NODE_DEFS.map((d) => [d.type, GenericNode as React.ComponentType<NodeProps>])
) as NodeTypes;

// ── Auto-layout (layered, barycenter-ordered) ─────────────────────
function autoLayout(nodes: Node<NodeData>[], edges: Edge[]): Node<NodeData>[] {
  if (nodes.length === 0) return nodes;
  const NODE_W = 212, NODE_H = 96, X_GAP = 48, Y_GAP = 56;
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  nodes.forEach((n) => { parents.set(n.id, []); children.set(n.id, []); });
  edges.forEach((e) => {
    if (children.has(e.source) && parents.has(e.target)) {
      children.get(e.source)!.push(e.target);
      parents.get(e.target)!.push(e.source);
    }
  });
  // Longest-path depth from roots (cycle-safe).
  const level = new Map<string, number>();
  const stack = new Set<string>();
  const depth = (id: string): number => {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    const ps = parents.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map((p) => depth(p) + 1)) : 0;
    stack.delete(id);
    level.set(id, d);
    return d;
  };
  nodes.forEach((n) => depth(n.id));

  const byLevel = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = level.get(n.id) ?? 0;
    const arr = byLevel.get(l);
    if (arr) arr.push(n.id); else byLevel.set(l, [n.id]);
  });

  const pos = new Map<string, { x: number; y: number }>();
  const bary = (id: string): number => {
    const xs = (parents.get(id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  for (const l of [...byLevel.keys()].sort((a, b) => a - b)) {
    const ids = l === 0 ? byLevel.get(l)! : [...byLevel.get(l)!].sort((a, b) => bary(a) - bary(b));
    const totalW = ids.length * NODE_W + (ids.length - 1) * X_GAP;
    ids.forEach((id, i) => pos.set(id, { x: Math.round(i * (NODE_W + X_GAP) - totalW / 2), y: l * (NODE_H + Y_GAP) }));
  }
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

// ── AI Flow Architect bridge ([קטגוריה 27]) ──────────────────────
interface AiGraph {
  nodes: Array<{ id: string; type: string; data: NodeData }>;
  edges: Array<{ source: string; target: string; sourceHandle: string | null }>;
}
interface AiIssue { message: string }
interface AiCollectionField { key: string; label: string; type: string; options?: string[]; required?: boolean }
interface AiCollectionSpec { name: string; label: string; fields: AiCollectionField[]; seedRows?: Record<string, unknown>[] }
interface AiResp {
  mode: "clarify" | "plan" | "build";
  message: string;
  questions?: string[];
  plan?: string[];
  flow?: AiGraph;
  /** Tables the AI will create when this build is applied. */
  collections?: AiCollectionSpec[];
  warnings?: AiIssue[];
  failedValidation?: AiIssue[];
}

function stripPos(data: NodeData): NodeData {
  const { position: _position, ...rest } = data as { position?: unknown } & NodeData;
  return rest;
}

/** Add the builder's UI fields and synthesize the engine's `condition` expr. */
function hydrateAiData(type: string, data: NodeData): NodeData {
  const out: NodeData = { ...data, nodeType: type, label: defFor(type).label };
  if (type === "condition") {
    out.condition = {
      op: "AND",
      rules: [{ field: out.condField ?? "", operator: out.condOp ?? "eq", value: out.condValue ?? "" }],
      groups: [],
    };
  }
  return out;
}

/** Compact added/changed/removed summary between the canvas and a proposed graph. */
function diffGraph(current: AiGraph, next: AiGraph): { added: number; changed: number; removed: number } {
  const cur = new Map(current.nodes.map((n) => [n.id, n]));
  const nxt = new Map(next.nodes.map((n) => [n.id, n]));
  let added = 0, changed = 0, removed = 0;
  for (const n of next.nodes) {
    const prev = cur.get(n.id);
    if (!prev) added++;
    else if (prev.type !== n.type || JSON.stringify(stripPos(prev.data)) !== JSON.stringify(stripPos(n.data))) changed++;
  }
  for (const n of current.nodes) if (!nxt.has(n.id)) removed++;
  return { added, changed, removed };
}

// ── Unsaved-changes guard ─────────────────────────────────────────
// A stable signature of the *saveable* state — graph + name + active. Edge
// styling and selection are excluded so cosmetic/UI churn never flags "dirty".
function serializeFlow(
  nodes: Array<{ id: string; type?: string; position?: { x: number; y: number }; data: NodeData }>,
  edges: Array<{ source: string; sourceHandle?: string | null; target: string }>,
  name: string,
  active: boolean
): string {
  return JSON.stringify({
    name,
    active,
    nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? "", position: n.position ?? { x: 0, y: 0 }, data: n.data })),
    edges: edges.map((e) => ({ source: e.source, handle: e.sourceHandle ?? null, target: e.target })),
  });
}

// A restored version arrives in the builder wire shape from the versions API.
interface RestorePayload {
  name: string;
  active: boolean;
  nodes: BuilderFlowT["nodes"];
  edges: BuilderFlowT["edges"];
}

// ── Builder ────────────────────────────────────────────────────────
function FlowBuilder({ flow, onBack, onSave }: { flow: BuilderFlowT; onBack: () => void; onSave: (f: BuilderFlowT) => Promise<void> }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(flow.nodes.map((n) => ({ ...n })) as Node<NodeData>[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    flow.edges.map((e) => ({ ...e, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 } }))
  );
  const [selected, setSelected] = useState<Node<NodeData> | null>(null);
  const [flowName, setFlowName] = useState(flow.name);
  const [active, setActive] = useState(flow.active);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [actions, setActions] = useState<ActionOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [flowOpts, setFlowOpts] = useState<FlowOpt[]>([]);
  const [resourceOpts, setResourceOpts] = useState<ResourceOpt[]>([]);
  const [collectionOpts, setCollectionOpts] = useState<CollectionOpt[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");   // wave 5: control-room skin (light default, per locked decision)
  const [showPreview, setShowPreview] = useState(false);            // wave 3: live WhatsApp phone preview
  const [advancedOpen, setAdvancedOpen] = useState(false);          // §2.8 Advanced drawer
  // wave 5: undo/redo history of structural edits (data-loss guard, §3.3).
  const [past, setPast] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);
  // F1: unsaved-changes guard. baseline = signature of the last-saved state.
  const baselineRef = useRef<string>(serializeFlow(flow.nodes, flow.edges, flow.name, flow.active));
  const [showLeave, setShowLeave] = useState(false);
  // F2: version history drawer.
  const [versionsOpen, setVersionsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/actions").then((r) => r.ok ? r.json() : { items: [] }).then((d) => setActions(d.items ?? [])).catch(() => {});
    fetch("/api/templates").then((r) => r.ok ? r.json() : { items: [] }).then((d) => setTemplates(d.items ?? [])).catch(() => {});
    fetch("/api/appointments/resources").then((r) => r.ok ? r.json() : { items: [] }).then((d) => setResourceOpts(d.items ?? [])).catch(() => {});
    fetch("/api/data/collections").then((r) => r.ok ? r.json() : { collections: [] }).then((d) => setCollectionOpts(d.collections ?? [])).catch(() => {});
    fetch("/api/flows").then((r) => r.ok ? r.json() : { flows: [] })
      .then((d) => setFlowOpts((d.flows ?? []).filter((f: FlowOpt) => f.id !== flow.id).map((f: FlowOpt) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, [flow.id]);

  // Live validation — the deterministic validator (src/modules/flow-ai/validator.ts),
  // run on every graph change. Entity lists are only passed once loaded, so a
  // still-loading actions/templates fetch can't raise false "unknown" warnings.
  const known = useMemo(() => ({
    actionIds: actions.length ? actions.map((a) => a.id) : undefined,
    templateNames: templates.length ? templates.map((t) => t.name) : undefined,
    resourceIds: resourceOpts.length ? resourceOpts.map((r) => r.id) : undefined,
    collectionNames: collectionOpts.length ? collectionOpts.map((c) => c.name) : undefined,
  }), [actions, templates, resourceOpts, collectionOpts]);
  const validation: ValidationResult = useMemo(
    () => validateGraph(toValidationGraph(nodes as Node<NodeData>[], edges), known),
    [nodes, edges, known]
  );
  const nodeLevels = useMemo(() => {
    const m = new Map<string, "error" | "warning">();
    for (const e of validation.errors) if (e.nodeId) m.set(e.nodeId, "error");
    for (const w of validation.warnings) if (w.nodeId && !m.has(w.nodeId)) m.set(w.nodeId, "warning");
    return m;
  }, [validation]);

  // ── History (undo/redo) — snapshot BEFORE each structural mutation (§3.3) ──
  const commit = useCallback(() => {
    setPast((p) => [...p.slice(-30), { nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) }]);
    setFuture([]);
  }, [nodes, edges]);
  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [{ nodes, edges }, ...f].slice(0, 30));
    setNodes(prev.nodes); setEdges(prev.edges); setSelected(null);
    setPast((p) => p.slice(0, -1));
  }, [past, nodes, edges, setNodes, setEdges]);
  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setPast((p) => [...p, { nodes, edges }]);
    setNodes(next.nodes); setEdges(next.edges); setSelected(null);
    setFuture((f) => f.slice(1));
  }, [future, nodes, edges, setNodes, setEdges]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // F1: dirty = current state drifted from the last save. Drives the exit guard.
  const dirty = useMemo(
    () => serializeFlow(nodes, edges, flowName, active) !== baselineRef.current,
    [nodes, edges, flowName, active]
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const handleBack = useCallback(() => {
    if (dirty) setShowLeave(true);
    else onBack();
  }, [dirty, onBack]);

  // F2: load a past version onto the canvas. Leaves the flow "dirty" so the author
  // reviews, then Saves — which records the restore as a fresh version (reversible).
  const restoreVersion = useCallback((v: RestorePayload) => {
    commit();
    setNodes(v.nodes.map((n) => ({ ...n })) as Node<NodeData>[]);
    setEdges(
      v.edges.map((e) => ({ ...e, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 } })) as Edge[]
    );
    setFlowName(v.name);
    setActive(v.active);
    setSelected(null);
    setVersionsOpen(false);
  }, [commit, setNodes, setEdges]);

  // Pan+select the first offending node when the validation pill is clicked.
  function focusIssue() {
    const first = validation.errors[0] ?? validation.warnings[0];
    if (!first?.nodeId) return;
    const target = nodes.find((x) => x.id === first.nodeId);
    if (target) {
      setSelected(target as Node<NodeData>);
      rfRef.current?.fitView({ nodes: [{ id: target.id }], padding: 0.6, duration: 300 });
    }
  }

  const onConnect = useCallback((p: Connection) => {
    commit();
    setEdges((eds) => addEdge({ ...p, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 } }, eds));
  }, [setEdges, commit]);
  const onNodeClick = useCallback((_: React.MouseEvent, n: Node) => setSelected(n as Node<NodeData>), []);

  const rfRef = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const tidy = useCallback(() => {
    setNodes((nds) => autoLayout(nds as Node<NodeData>[], edges));
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 300 }), 60);
  }, [setNodes, edges]);

  // AI Flow Architect ([קטגוריה 27]).
  const [aiOpen, setAiOpen] = useState(false);
  const getCurrentGraph = useCallback((): AiGraph => ({
    nodes: nodes.map((n) => ({ id: n.id, type: (n.type as string) ?? "message", data: stripPos(n.data) })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  }), [nodes, edges]);
  const applyAiFlow = useCallback((g: AiGraph) => {
    commit();
    const rfNodes = g.nodes.map((n) => ({
      id: n.id, type: n.type, position: { x: 0, y: 0 }, data: hydrateAiData(n.type, n.data),
    })) as Node<NodeData>[];
    const rfEdges: Edge[] = g.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined, type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 },
    }));
    setNodes(autoLayout(rfNodes, rfEdges));
    setEdges(rfEdges);
    setSelected(null);
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 300 }), 60);
  }, [setNodes, setEdges]);

  // After the AI provisions tables on apply, re-pull collections so live
  // validation drops its "table does not exist" warnings immediately.
  const refreshCollections = useCallback(() => {
    return fetch("/api/data/collections")
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d) => setCollectionOpts(d.collections ?? []))
      .catch(() => {});
  }, []);

  // Right-click context menu (delete edge / node).
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "edge" | "node"; id: string } | null>(null);
  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, kind: "edge", id: edge.id });
  }, []);
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, kind: "node", id: node.id });
  }, []);
  function deleteFromMenu() {
    if (!menu) return;
    commit();
    if (menu.kind === "edge") {
      setEdges((eds) => eds.filter((ed) => ed.id !== menu.id));
    } else {
      setEdges((eds) => eds.filter((ed) => ed.source !== menu.id && ed.target !== menu.id));
      setNodes((nds) => nds.filter((n) => n.id !== menu.id));
      setSelected((sel) => (sel?.id === menu.id ? null : sel));
    }
    setMenu(null);
  }

  function seedData(type: NodeKind, block?: BlockId): NodeData {
    const data: NodeData = { nodeType: type, label: defFor(type).label, authorBlock: block ?? TYPE_TO_BLOCK[type] };
    if (type === "start") data.keyword = "שלום";
    if (type === "message") { data.text = ""; data.msgMode = "rich"; data.headerKind = "none"; data.interactive = "none"; }
    if (type === "buttons") { data.buttons = [{ id: `btn_${Date.now()}`, label: "אפשרות 1" }]; if (block === "message") { data.msgMode = "rich"; data.headerKind = "none"; data.interactive = "buttons"; } }
    if (type === "delay") data.minutes = 60;
    if (type === "tag") data.op = "add";
    if (type === "handoff") data.reason = "customer_request";
    if (type === "media") { data.mediaKind = "image"; data.msgMode = "rich"; data.headerKind = "image"; data.interactive = "none"; }
    if (type === "api") { data.method = "GET"; data.outputKey = "lastApi"; }
    if (type === "validate") { data.field = "message.text"; data.required = true; }
    if (type === "list") { data.text = "בחר אפשרות:"; data.buttonLabel = "בחר"; data.rows = [{ id: `row_${Date.now()}`, title: "פריט 1" }]; if (block === "message") { data.msgMode = "rich"; data.headerKind = "none"; data.interactive = "list"; } }
    if (type === "switch") { data.field = "state."; data.cases = []; }
    if (type === "set_var") { data.target = ""; data.transform = "none"; }
    if (type === "ai_classify") { data.outputKey = "intent"; data.cases = []; }
    if (type === "ai_extract") { data.sourceField = "message.text"; data.fields = []; data.fieldPairs = []; }
    if (type === "appointment") { data.days = 7; data.text = "בחר מועד פנוי:"; data.buttonLabel = "בחר מועד"; }
    if (type === "run_code") { data.code = "// יש לך גישה ל-state ול-input\n// החזר ערך עם return\nreturn state;"; data.outputKey = "codeResult"; data.timeoutMs = 1000; }
    if (type === "split") data.branches = [
      { handle: `var_${Date.now()}_a`, weight: 50, label: "A" },
      { handle: `var_${Date.now()}_b`, weight: 50, label: "B" },
    ];
    if (type === "location") { data.latitude = 0; data.longitude = 0; data.msgMode = "location"; data.authorBlock = "message"; }
    if (type === "template") { data.msgMode = "template"; data.authorBlock = "message"; }
    if (type === "wait_reply") data.timeoutMinutes = 60;
    return data;
  }

  /** Build a fresh node object for a block/type at a position (no state writes). */
  function makeNode(type: NodeKind, block: BlockId | undefined, position: { x: number; y: number }): Node<NodeData> {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    return { id, type, position, data: seedData(type, block) };
  }

  /** Palette: add a block's seed node and select it. */
  function addBlock(block: BlockDef) {
    commit();
    const node = makeNode(block.seed, block.id, { x: 280 + Math.random() * 140, y: 120 + Math.random() * 180 });
    setNodes((nds) => [...nds, node]);
    setSelected(node);
  }
  function addSubtype(sub: SubType, block: BlockId) {
    commit();
    const node = makeNode(sub.type, block, { x: 280 + Math.random() * 140, y: 120 + Math.random() * 180 });
    setNodes((nds) => [...nds, node]);
    setSelected(node);
  }

  /** Connect-via-"+": drop a Message step wired to the given branch and select it. */
  const onAddStep = useCallback((sourceId: string, handle: string) => {
    commit();
    const src = nodes.find((n) => n.id === sourceId);
    const pos = src ? { x: src.position.x, y: src.position.y + 160 } : { x: 300, y: 200 };
    const id = `message_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const node: Node<NodeData> = { id, type: "message", position: pos, data: seedData("message", "message") };
    setNodes((nds) => [...nds, node]);
    setEdges((eds) => addEdge({ source: sourceId, sourceHandle: handle, target: id, targetHandle: null, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 } }, eds));
    setSelected(node);
  }, [nodes, setNodes, setEdges, commit]);

  /** Overflow split (§2.3): pull a media header out of a list node into a preceding `media` node. */
  function splitMediaBefore(listNodeId: string) {
    commit();
    const target = nodes.find((n) => n.id === listNodeId);
    if (!target) return;
    const d = target.data as NodeData;
    const mediaId = `media_${Date.now()}`;
    const mediaNode: Node<NodeData> = {
      id: mediaId, type: "media",
      position: { x: target.position.x, y: target.position.y - 150 },
      data: { nodeType: "media", authorBlock: "message", mediaKind: d.headerKind, link: d.headerLink, caption: "" },
    };
    setNodes((nds) => [mediaNode, ...nds.map((n) => n.id === listNodeId ? { ...n, data: { ...n.data, headerKind: "none", headerLink: undefined, header: undefined } } : n)]);
    setEdges((eds) => {
      const rerouted = eds.map((e) => e.target === listNodeId ? { ...e, target: mediaId } : e);
      return addEdge({ source: mediaId, sourceHandle: "output", target: listNodeId, targetHandle: null, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" }, style: { stroke: "#94A3B8", strokeWidth: 2 } }, rerouted);
    });
  }

  function updateSelected(updates: NodeData) {
    if (!selected) return;
    setNodes((nds) => nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...updates } } : n)));
    setSelected((prev) => (prev ? { ...prev, data: { ...prev.data, ...updates } } : null));
  }

  /** Change the selected node's engine type (sub-type switch / Message compose) + merge data.
   *  Intentionally NOT snapshotted — like updateSelected, field-level edits aren't undo steps
   *  (the composer calls this on every keystroke; structural actions snapshot separately). */
  function morphSelected(newType: NodeKind, dataPatch: NodeData = {}) {
    if (!selected) return;
    setNodes((nds) => nds.map((n) => (n.id === selected.id ? { ...n, type: newType, data: { ...n.data, ...dataPatch, nodeType: newType } } : n)));
    setSelected((prev) => (prev ? { ...prev, type: newType, data: { ...prev.data, ...dataPatch, nodeType: newType } } : null));
  }

  function deleteSelected() {
    if (!selected) return;
    commit();
    setNodes((nds) => nds.filter((n) => n.id !== selected.id));
    setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  }

  async function handleSave(activeOverride?: boolean): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setSaveError(null);
    const nextActive = activeOverride ?? active;
    const payload = {
      ...flow, name: flowName, active: nextActive,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? "message", position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? null, target: e.target, targetHandle: e.targetHandle ?? null })),
      updatedAt: new Date().toISOString(),
    };
    try {
      await onSave(payload);
      setActive(nextActive);
      baselineRef.current = serializeFlow(nodes, edges, flowName, nextActive);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "השמירה נכשלה");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const dark = theme === "dark";
  return (
    <div className="flow-studio-v2" data-theme={dark ? "dark" : undefined} style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", background: "var(--bg-app)", color: "var(--fg-primary)" }}>
      <style>{`
        .flow-palette-item:hover { background: var(--bg-subtle); }
        .flow-block:hover { border-color: var(--border-strong); background: var(--bg-subtle); }
        .flow-iconbtn:hover { background: var(--bg-subtle); }
        .react-flow__handle { transition: transform .1s ease; }
        .react-flow__handle:hover { transform: scale(1.3); }
        .react-flow__controls { border: 1px solid var(--bg-border); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
        .react-flow__controls-button { background: #fff; border-bottom: 1px solid var(--bg-border); }
        .react-flow__controls-button:hover { background: var(--bg-base); }
        .flow-ctx-item:hover { background: #FEF2F2; }
      `}</style>
      {/* Top bar */}
      <div className="flow-studio-bar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "var(--bg-card)", borderBottom: "1px solid var(--bg-border)", flexShrink: 0 }}>
        <button onClick={handleBack} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
          <ArrowRight size={14} /> רשימת תהליכים
        </button>
        <div style={{ width: 1, height: 18, background: "var(--bg-border)" }} />
        <input value={flowName} onChange={(e) => setFlowName(e.target.value)} style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-primary)", background: "none", border: "none", outline: "none", minWidth: 140 }} />
        <button onClick={undo} disabled={!past.length} title="בטל (Ctrl+Z)" className="flow-iconbtn"
          style={{ display: "flex", alignItems: "center", padding: 6, borderRadius: 7, background: "none", border: "none", cursor: past.length ? "pointer" : "default", opacity: past.length ? 1 : 0.35 }}>
          <Undo2 size={15} color="var(--fg-secondary)" />
        </button>
        <button onClick={redo} disabled={!future.length} title="חזור (Ctrl+Shift+Z)" className="flow-iconbtn"
          style={{ display: "flex", alignItems: "center", padding: 6, borderRadius: 7, background: "none", border: "none", cursor: future.length ? "pointer" : "default", opacity: future.length ? 1 : 0.35 }}>
          <Redo2 size={15} color="var(--fg-secondary)" />
        </button>
        <div style={{ flex: 1 }} />
        {/* Live validation pill (§5) — click jumps to the first issue; publish is gated on errors */}
        <button onClick={() => setIssuesOpen((value) => !value)} className="flow-validation-trigger"
          title={validation.errors.length ? "יש שגיאות שחוסמות הפעלה — לחץ למעבר לבעיה" : validation.warnings.length ? "יש אזהרות — לחץ למעבר" : "התהליך תקין"}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: "var(--radius-full)", fontSize: 12, fontWeight: 500, border: "1px solid",
            background: validation.errors.length ? "var(--c-danger-50)" : validation.warnings.length ? "var(--c-warning-50)" : "var(--c-brand-50)",
            color: validation.errors.length ? "var(--c-danger)" : validation.warnings.length ? "var(--c-warning)" : "var(--c-brand-strong)",
            borderColor: validation.errors.length ? "var(--c-danger)" : validation.warnings.length ? "var(--c-warning)" : "var(--c-brand)",
            cursor: "pointer" }}>
          {validation.errors.length
            ? <><AlertTriangle size={13} /> {validation.errors.length} שגיאות</>
            : validation.warnings.length
              ? <><AlertTriangle size={13} /> {validation.warnings.length} אזהרות</>
              : <><CheckCircle2 size={13} /> תקין</>}
        </button>
        <div style={{ width: 1, height: 18, background: "var(--bg-border)" }} />
        <span className="flow-publish-state" style={{ fontSize: 12, color: "var(--text-muted)" }}>{active ? "פורסם" : "טיוטה"}</span>
        <button
          onClick={() => { if (!active && validation.errors.length) return; setActive((v) => !v); }}
          title={!active && validation.errors.length ? "לא ניתן להפעיל תהליך עם שגיאות — תקן אותן קודם" : "הפעלה/כיבוי התהליך"}
          style={{ background: "none", border: "none", cursor: !active && validation.errors.length ? "not-allowed" : "pointer", opacity: !active && validation.errors.length ? 0.5 : 1 }}>
          {active ? <ToggleRight size={22} color="var(--accent)" /> : <ToggleLeft size={22} color="#D1D5DB" />}
        </button>
        <div style={{ width: 1, height: 18, background: "var(--bg-border)" }} />
        <button onClick={() => setShowPreview((v) => !v)} title="תצוגה מקדימה של השיחה בטלפון" className="flow-iconbtn flow-secondary-action"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: showPreview ? "var(--c-brand-50)" : "transparent", color: showPreview ? "var(--c-brand-strong)" : "var(--fg-secondary)", border: "1px solid", borderColor: showPreview ? "var(--c-brand)" : "var(--border)", cursor: "pointer" }}>
          <Smartphone size={14} /> תצוגה
        </button>
        <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title={dark ? "מצב בהיר" : "מצב כהה (חדר-בקרה)"} className="flow-iconbtn flow-secondary-action"
          style={{ display: "flex", alignItems: "center", padding: 6, borderRadius: 8, background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
          {dark ? <Sun size={14} color="var(--fg-secondary)" /> : <Moon size={14} color="var(--fg-secondary)" />}
        </button>
        <button onClick={() => setAiOpen((v) => !v)} title="בנה תהליך עם AI מתיאור בעברית"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: aiOpen ? "var(--c-brand)" : "var(--c-brand-50)", color: aiOpen ? "#fff" : "var(--c-brand-strong)", border: "none", cursor: "pointer" }}>
          <Sparkles size={13} /> עוזר AI
        </button>
        <button onClick={tidy} title="סידור אוטומטי של הצמתים על הקנבס" className="flow-secondary-action"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" }}>
          <LayoutGrid size={13} /> סדר אוטומטי
        </button>
        <button onClick={() => setVersionsOpen((v) => !v)} title="היסטוריית גרסאות — צפה ושחזר שמירות קודמות" className="flow-iconbtn flow-secondary-action"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: versionsOpen ? "var(--c-brand-50)" : "transparent", color: versionsOpen ? "var(--c-brand-strong)" : "var(--fg-secondary)", border: "1px solid", borderColor: versionsOpen ? "var(--c-brand)" : "var(--border)", cursor: "pointer" }}>
          <History size={14} /> היסטוריה
        </button>
        <button onClick={() => void handleSave()} disabled={saving} title={dirty ? "יש שינויים שלא נשמרו" : "שמור"} className="flow-save-action" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: saved ? "var(--accent-light)" : "var(--accent)", color: saved ? "var(--accent-dark)" : "#fff", border: "none", cursor: saving ? "wait" : "pointer" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {saving ? "שומר..." : saved ? "נשמר" : dirty ? "שמור •" : "שמור"}
        </button>
        <button onClick={() => { if (validation.errors.length) { setIssuesOpen(true); return; } void handleSave(true); }} disabled={saving || active && !dirty}
          className="flow-publish-action"><Send size={13} /> {active ? "מעודכן באוויר" : "פרסום"}</button>
      </div>

      {saveError && <div className="flow-save-error"><AlertTriangle size={14} />{saveError}<button onClick={() => setSaveError(null)}><X size={13} /></button></div>}

      {issuesOpen && (
        <aside className="flow-issues-panel">
          <header><div><small>בדיקת תהליך</small><b>{validation.errors.length ? `${validation.errors.length} שגיאות לתיקון` : validation.warnings.length ? `${validation.warnings.length} אזהרות` : "מוכן לפרסום"}</b></div><button onClick={() => setIssuesOpen(false)}><X size={15} /></button></header>
          {!validation.errors.length && !validation.warnings.length ? <div className="flow-issues-ok"><CheckCircle2 size={20} />כל השלבים והחיבורים תקינים.</div> :
            <div className="flow-issues-list">{[...validation.errors, ...validation.warnings].map((issue, index) => <button key={`${issue.code}-${index}`} onClick={() => { if (issue.nodeId) { const target = nodes.find((node) => node.id === issue.nodeId); if (target) { setSelected(target); rfRef.current?.fitView({ nodes: [{ id: target.id }], padding: .6, duration: 300 }); } } setIssuesOpen(false); }}><span className={issue.level}>{issue.level === "error" ? <AlertTriangle size={13} /> : <Info size={13} />}</span><div><b>{issue.level === "error" ? "שגיאה" : "אזהרה"}</b><p>{issue.message}</p></div><ChevronLeft size={14} /></button>)}</div>}
        </aside>
      )}

      <div className="flow-studio-body" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Palette — 5 author blocks + Advanced drawer (redesign §2.2) */}
        <div className="flow-studio-palette" style={{ width: 190, borderLeft: "1px solid var(--border)", background: "var(--bg-surface)", flexShrink: 0, overflowY: "auto" }}>
          <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", margin: "0 0 2px" }}>הוסף שלב</p>
            {BLOCKS.map((b) => {
              const Icon = b.icon;
              return (
                <button key={b.id} onClick={() => addBlock(b)} className="flow-block"
                  style={{ width: "100%", textAlign: "right", display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 10px", borderRadius: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", cursor: "pointer", transition: "background var(--dur-fast), border-color var(--dur-fast)" }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={b.accent} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--fg-primary)" }}>{b.label}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--fg-muted)", lineHeight: 1.35, marginTop: 1 }}>{b.desc}</span>
                  </span>
                </button>
              );
            })}
            <button onClick={() => setAdvancedOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "6px 8px", background: "none", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "var(--fg-muted)" }}>
              <ChevronDown size={13} style={{ transform: advancedOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} /> מתקדם
            </button>
            {advancedOpen && (
              <div className="flow-advanced-list" style={{ display: "flex", flexDirection: "column", gap: 2, paddingInlineStart: 4 }}>
                {ADVANCED_SUBTYPES.map((sub) => {
                  const Icon = defFor(sub.type).icon;
                  return (
                    <button key={sub.type} onClick={() => addSubtype(sub, TYPE_TO_BLOCK[sub.type] ?? "do")} className="flow-palette-item"
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, background: "transparent", border: "1px solid transparent", cursor: "pointer", fontSize: 12, color: "var(--fg-secondary)" }}>
                      <Icon size={14} color="var(--fg-muted)" /><span style={{ flex: 1, textAlign: "right" }}>{sub.label}</span><Plus size={11} color="var(--fg-dim)" />
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flow-palette-tip" style={{ display: "flex", gap: 6, padding: "8px 10px", marginTop: 4, background: "var(--bg-subtle)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 10.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0 }}>בחר בלוק כדי להוסיף שלב; את הסוג המדויק קובעים בלוח שמימין. כל ענף מציע <b>+</b> להמשך.</p>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flow-studio-canvas" style={{ flex: 1, background: "var(--canvas-bg)", position: "relative" }}>
          <ValidationContext.Provider value={nodeLevels}>
          <AddStepContext.Provider value={onAddStep}>
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={() => { setSelected(null); setMenu(null); }}
            onEdgeContextMenu={onEdgeContextMenu} onNodeContextMenu={onNodeContextMenu}
            onInit={(i) => { rfRef.current = i; }}
            nodeTypes={nodeTypes} fitView snapToGrid snapGrid={[12, 12]} deleteKeyCode={["Delete", "Backspace"]}
            defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--edge)", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8", width: 16, height: 16 } }}>
            <Background variant={BackgroundVariant.Dots} color="var(--canvas-dot)" gap={20} size={1.5} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={(n) => railHex(defFor(n.type ?? "message").flowClass)} nodeStrokeWidth={2} pannable zoomable style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
          </ReactFlow>
          </AddStepContext.Provider>
          </ValidationContext.Provider>
          {/* Onboarding: a fresh flow has only Start — two doors instead of a fragmented seed (§3.5) */}
          {nodes.filter((n) => n.type !== "start").length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ pointerEvents: "auto", width: 380, maxWidth: "90%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--elev-3)", padding: 22, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg-primary)", marginBottom: 4 }}>נתחיל לבנות את התהליך</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5, marginBottom: 16 }}>ספר ל-AI מה צריך — או בנה ידנית בלוק-בלוק.</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setAiOpen(true)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 10px", borderRadius: 12, background: "var(--c-brand-50)", border: "1px solid var(--c-brand-100)", cursor: "pointer", color: "var(--c-brand-strong)" }}>
                    <Sparkles size={20} /><span style={{ fontSize: 12.5, fontWeight: 700 }}>ספר ל-AI</span>
                  </button>
                  <button onClick={() => { const st = nodes.find((n) => n.type === "start"); if (st) onAddStep(st.id, "output"); else addBlock(BLOCKS[0]); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 10px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--fg-secondary)" }}>
                    <MessageSquare size={20} /><span style={{ fontSize: 12.5, fontWeight: 700 }}>בנה ידנית</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Phone preview — the WhatsApp twin-screen (§3, the bootWhat DNA) */}
        {showPreview && (
          <PhonePreview node={selected} onClose={() => setShowPreview(false)} />
        )}

        {/* Config panel */}
        {selected && (
          <div className="flow-studio-config" style={{ width: 286, borderRight: "1px solid var(--border)", background: "var(--bg-surface)", flexShrink: 0, overflowY: "auto" }}>
            <button className="flow-config-close" onClick={() => setSelected(null)} aria-label="סגירת הגדרות"><X size={16} /></button>
            <NodeConfig key={selected.id} type={selected.type ?? "message"} data={selected.data}
              actions={actions} templates={templates} flowOpts={flowOpts} resourceOpts={resourceOpts}
              collections={collectionOpts}
              memories={collectMemories(nodes)}
              nodeList={nodes.filter((n) => n.id !== selected.id).map((n) => ({ id: n.id, label: `${defFor(n.type ?? "message").label}${summaryFor(n.type ?? "message", n.data).trim() ? ` · ${summaryFor(n.type ?? "message", n.data).slice(0, 18)}` : ""}` }))}
              onChange={updateSelected} onMorph={morphSelected} onSplitMedia={() => splitMediaBefore(selected.id)} onDelete={deleteSelected} />
          </div>
        )}

        {/* AI Flow Architect panel */}
        {aiOpen && (
          <AiPanel flowId={flow.id} getGraph={getCurrentGraph} onApply={applyAiFlow} onCollectionsChanged={refreshCollections} onClose={() => setAiOpen(false)} />
        )}

        {/* Version history (F2) */}
        {versionsOpen && (
          <VersionsPanel flowId={flow.id} onRestore={restoreVersion} onClose={() => setVersionsOpen(false)} />
        )}
      </div>

      {/* Unsaved-changes guard (F1) */}
      {showLeave && (
        <div onClick={() => setShowLeave(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 360, maxWidth: "90%", background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--elev-3)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--c-warning-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><AlertTriangle size={16} color="var(--c-warning)" /></span>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg-primary)" }}>יש שינויים שלא נשמרו</div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: "0 0 16px" }}>ערכת את התהליך ולא שמרת. מה לעשות לפני היציאה?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={async () => { if (await handleSave()) { setShowLeave(false); onBack(); } }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}>
                <Save size={14} /> שמור וצא
              </button>
              <button onClick={() => { setShowLeave(false); onBack(); }}
                style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-base)", color: "#DC2626", border: "1px solid var(--bg-border)", cursor: "pointer" }}>
                צא בלי לשמור
              </button>
              <button onClick={() => setShowLeave(false)}
                style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "transparent", color: "var(--fg-secondary)", border: "none", cursor: "pointer" }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <>
          <div onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50, background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(15,23,42,.16)", padding: 4, minWidth: 156 }}>
            <button className="flow-ctx-item" onClick={deleteFromMenu}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "#DC2626", background: "none", border: "none", cursor: "pointer", textAlign: "right" }}>
              <Trash2 size={14} /> {menu.kind === "edge" ? "מחק חיבור" : "מחק צומת"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── AI Flow Architect panel ([קטגוריה 27]) ───────────────────────
interface AiChatMsg { role: "user" | "assistant"; content: string; data?: AiResp }

interface AiSessionSummary { id: string; title: string; turnCount: number; updatedAt: string }

const AI_WELCOME: AiChatMsg = { role: "assistant", content: "תאר לי במילים מה התהליך צריך לעשות — ואבנה לך אותו על הקנבס.\n\nלמשל: \"בוט לקליניקת שיניים: מקבל פנייה, שואל אם דחוף, אם כן מעביר לנציג, אחרת מציע לקבוע תור\"." };

function AiPanel({ flowId, getGraph, onApply, onCollectionsChanged, onClose }: {
  flowId: string; getGraph: () => AiGraph; onApply: (g: AiGraph) => void; onCollectionsChanged?: () => Promise<unknown> | void; onClose: () => void;
}) {
  const [messages, setMessages] = useState<AiChatMsg[]>([AI_WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<AiSessionSummary[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  // F3: persist the chat (incl. each build's graph) so it can be reopened/restored.
  const persist = useCallback(async (msgs: AiChatMsg[]) => {
    if (!msgs.some((m) => m.role === "user")) return; // skip the bare welcome
    try {
      const res = await fetch("/api/flows/ai/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionIdRef.current, flowId, turns: msgs }),
      });
      const d = await res.json().catch(() => null);
      if (d?.id) sessionIdRef.current = d.id;
    } catch { /* best-effort */ }
  }, [flowId]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const withUser: AiChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(withUser);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/flows/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, currentFlow: getGraph() }),
      });
      const data = (await res.json()) as AiResp & { error?: string };
      const reply: AiChatMsg = (!res.ok || data.error)
        ? { role: "assistant", content: data.error ? `אירעה שגיאה: ${data.error}` : "אירעה שגיאה בבקשה." }
        : { role: "assistant", content: data.message || "", data };
      const next = [...withUser, reply];
      setMessages(next);
      void persist(next);
    } catch {
      setMessages((ms) => [...ms, { role: "assistant", content: "תקלת רשת. נסה שוב." }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    sessionIdRef.current = null;
    setMessages([AI_WELCOME]);
    setApplied(new Set());
    setHistoryOpen(false);
  }

  async function openHistory() {
    setHistoryOpen(true);
    try {
      const res = await fetch(`/api/flows/ai/sessions?flowId=${flowId}`);
      const d = await res.json();
      setSessions(d.sessions ?? []);
    } catch { setSessions([]); }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/flows/ai/sessions?id=${id}`);
      if (!res.ok) return;
      const s = await res.json();
      sessionIdRef.current = s.id;
      setMessages((s.turns ?? [AI_WELCOME]) as AiChatMsg[]);
      setApplied(new Set());
      setHistoryOpen(false);
    } catch { /* ignore */ }
  }

  return (
    <div style={{ width: 340, borderRight: "1px solid var(--bg-border)", background: "var(--bg-card)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--bg-border)", flexShrink: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center" }}><Sparkles size={15} color="var(--accent-dark)" /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>עוזר AI</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>בונה תהליך מתיאור בעברית</div>
        </div>
        <button onClick={openHistory} title="שיחות קודמות" className="flow-iconbtn" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6 }}><MessagesSquare size={15} color="var(--text-muted)" /></button>
        <button onClick={newChat} title="שיחה חדשה" className="flow-iconbtn" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6 }}><PlusIcon size={15} color="var(--text-muted)" /></button>
        <button onClick={onClose} title="סגור" style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color="var(--text-muted)" /></button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <AiMessage key={i} msg={m} applied={applied.has(i)} loading={loading} currentGraph={getGraph}
            onApply={async (g) => {
              // The AI declared tables this flow needs → create them first, then
              // refresh so the canvas validator sees them, then drop the graph in.
              const cols = m.data?.collections;
              if (cols?.length) {
                await fetch("/api/flows/ai/provision", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ collections: cols }),
                }).catch(() => {});
                await onCollectionsChanged?.();
              }
              onApply(g);
              setApplied((s) => new Set(s).add(i));
            }}
            onApprovePlan={() => send("אשר, בנה את התהליך עכשיו")} />
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 7, color: "var(--text-muted)", fontSize: 12 }}>
            <Loader2 size={14} className="ai-spin" /> חושב...
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid var(--bg-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={2} placeholder="תאר את התהליך... (Enter לשליחה)" style={{ ...inputStyle, resize: "none", lineHeight: 1.4 }} />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}
            style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: loading || !input.trim() ? "default" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1, flexShrink: 0 }}>
            <Send size={15} />
          </button>
        </div>
      </div>

      {historyOpen && (
        <div style={{ position: "absolute", inset: 0, background: "var(--bg-card)", display: "flex", flexDirection: "column", zIndex: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--bg-border)" }}>
            <MessagesSquare size={15} color="var(--text-muted)" />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>שיחות קודמות</div>
            <button onClick={() => setHistoryOpen(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color="var(--text-muted)" /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {sessions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "center", marginTop: 24 }}>אין שיחות שמורות עדיין.</div>
            ) : sessions.map((s) => (
              <button key={s.id} onClick={() => loadSession(s.id)}
                style={{ textAlign: "right", border: "1px solid var(--bg-border)", borderRadius: 10, padding: "9px 11px", background: "var(--bg-base)", cursor: "pointer" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 2 }}>{s.turnCount} הודעות · {relTime(s.updatedAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <style>{`.ai-spin { animation: ai-spin 1s linear infinite; } @keyframes ai-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AiMessage({ msg, applied, loading, currentGraph, onApply, onApprovePlan }: {
  msg: AiChatMsg; applied: boolean; loading: boolean; currentGraph: () => AiGraph;
  onApply: (g: AiGraph) => void; onApprovePlan: () => void;
}) {
  const d = msg.data;
  if (msg.role === "user") {
    return <div style={{ alignSelf: "flex-start", maxWidth: "88%", background: "var(--accent)", color: "#fff", padding: "8px 11px", borderRadius: 12, borderBottomRightRadius: 4, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{msg.content}</div>;
  }

  const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 8, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 };
  const issues = [...(d?.failedValidation ?? []), ...(d?.warnings ?? [])];

  return (
    <div style={{ alignSelf: "flex-end", maxWidth: "92%", background: "var(--bg-base)", color: "var(--text-primary)", padding: "9px 11px", borderRadius: 12, borderBottomLeftRadius: 4, fontSize: 12.5, lineHeight: 1.55, border: "1px solid var(--bg-border)" }}>
      {msg.content && <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>}

      {d?.mode === "clarify" && d.questions && d.questions.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 3 }}>
          {d.questions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      )}

      {d?.mode === "plan" && d.plan && d.plan.length > 0 && (
        <>
          <ol style={{ margin: "8px 0 0", paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {d.plan.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
          <button onClick={onApprovePlan} disabled={loading} style={primaryBtn}><Check size={13} /> אשר ובנה</button>
        </>
      )}

      {d?.mode === "build" && d.flow && (() => {
        const diff = diffGraph(currentGraph(), d.flow);
        const isEdit = diff.removed > 0 || diff.changed > 0;
        return (
          <>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              {d.flow.nodes.length} צמתים · {d.flow.edges.length} חיבורים
              {isEdit && ` · שינויים: +${diff.added} ~${diff.changed} −${diff.removed}`}
            </div>
            {d.collections && d.collections.length > 0 && (
              <div style={{ marginTop: 8, background: "var(--c-info-50)", border: "1px solid var(--c-info)", borderRadius: 8, padding: "6px 8px", fontSize: 11, color: "var(--c-info)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                  <Database size={12} /> {applied ? "נוצרו טבלאות נתונים" : "ייווצרו טבלאות נתונים אוטומטית"}
                </div>
                <ul style={{ margin: "3px 0 0", paddingInlineStart: 16 }}>
                  {d.collections.map((c, i) => (
                    <li key={i}>{c.label || c.name} · {c.fields.length} שדות{c.seedRows?.length ? ` · ${c.seedRows.length} שורות התחלה` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
            {applied ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--accent-dark)", fontSize: 12, fontWeight: 600 }}><Check size={14} /> הוחל על הקנבס</div>
            ) : (
              <button onClick={() => onApply(d.flow!)} disabled={loading} style={primaryBtn}><Wand2 size={13} /> {isEdit ? "החל את השינויים" : "החל על הקנבס"}</button>
            )}
          </>
        );
      })()}

      {issues.length > 0 && (
        <div style={{ marginTop: 8, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 8px", fontSize: 11, color: "#92400E" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, marginBottom: 3 }}>
            <AlertTriangle size={12} /> {d?.failedValidation?.length ? "בעיות שלא נסגרו" : "שים לב"}
          </div>
          <ul style={{ margin: 0, paddingInlineStart: 16, display: "flex", flexDirection: "column", gap: 2 }}>
            {issues.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Version history panel (F2) ────────────────────────────────────
/** Compact Hebrew relative time for history lists. */
function relTime(value: string | Date): string {
  const ms = Date.now() - new Date(value).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "הרגע";
  if (m < 60) return `לפני ${m} ד׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  const days = Math.round(h / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(value).toLocaleDateString("he-IL");
}

interface VersionSummary { version: number; name: string; status: string; enabled: boolean; savedAt: string; nodeCount: number; edgeCount: number }

function VersionsPanel({ flowId, onRestore, onClose }: {
  flowId: string; onRestore: (v: RestorePayload) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/flows/${flowId}/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d) => setItems(d.versions ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [flowId]);

  async function restore(version: number) {
    setBusy(version);
    try {
      const res = await fetch(`/api/flows/${flowId}/versions/${version}`);
      if (!res.ok) return;
      const v = await res.json();
      onRestore({ name: v.name, active: v.active, nodes: v.nodes, edges: v.edges });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ width: 320, borderRight: "1px solid var(--bg-border)", background: "var(--bg-card)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--bg-border)", flexShrink: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center" }}><History size={15} color="var(--fg-secondary)" /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>היסטוריית גרסאות</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>כל שמירה נשמרת — שחזר בלחיצה</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color="var(--text-muted)" /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-muted)", fontSize: 12, padding: 8 }}><Loader2 size={14} className="ai-spin" /> טוען...</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>אין עדיין גרסאות שמורות.<br />כל שמירה מכאן ואילך תופיע כאן.</div>
        ) : items.map((v, i) => (
          <div key={v.version} style={{ border: "1px solid var(--bg-border)", borderRadius: 10, padding: "9px 11px", background: "var(--bg-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>גרסה {v.version}</span>
              {i === 0 && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--c-brand-strong)", background: "var(--c-brand-50)", borderRadius: 6, padding: "1px 6px" }}>נוכחית</span>}
              {v.enabled && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent-dark)", background: "var(--accent-light)", borderRadius: 6, padding: "1px 6px" }}>פעיל</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>{relTime(v.savedAt)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 8 }}>{v.name} · {v.nodeCount} צמתים · {v.edgeCount} חיבורים</div>
            <button onClick={() => restore(v.version)} disabled={busy !== null}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "var(--bg-card)", color: "var(--c-brand-strong)", border: "1px solid var(--c-brand)", cursor: busy !== null ? "default" : "pointer", opacity: busy !== null && busy !== v.version ? 0.5 : 1 }}>
              {busy === v.version ? <Loader2 size={12} className="ai-spin" /> : <RotateCcw size={12} />} שחזר לגרסה זו
            </button>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--bg-border)", fontSize: 10.5, color: "var(--fg-muted)", lineHeight: 1.5, flexShrink: 0 }}>
        שחזור טוען את הגרסה לקנבס — בדוק ולחץ "שמור" כדי לאשר (נשמר כגרסה חדשה).
      </div>
      <style>{`.ai-spin { animation: ai-spin 1s linear infinite; } @keyframes ai-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Config panel (per node type) ──────────────────────────────────
const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 12, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };

interface InspectorProps {
  type: string; data: NodeData;
  actions: ActionOpt[]; templates: TemplateOpt[]; flowOpts: FlowOpt[]; resourceOpts: ResourceOpt[];
  collections: CollectionOpt[];
  memories: string[]; nodeList: Array<{ id: string; label: string }>;
  onChange: (u: NodeData) => void; onMorph: (type: NodeKind, patch?: NodeData) => void;
  onSplitMedia: () => void; onDelete: () => void;
}

/** Default-data patch when morphing to a new sub-type (keeps shared fields). */
function morphSeed(type: NodeKind, data: NodeData): NodeData {
  const p: NodeData = {};
  if (type === "buttons" && !data.buttons) p.buttons = [{ id: `btn_${Date.now()}`, label: "אפשרות 1" }];
  if (type === "list" && !data.rows) { p.rows = [{ id: `row_${Date.now()}`, title: "פריט 1" }]; p.buttonLabel = data.buttonLabel ?? "בחר"; }
  if (type === "switch" && !data.cases) { p.field = data.field ?? "state.choice"; p.cases = []; }
  if (type === "ai_classify" && !data.cases) { p.outputKey = data.outputKey ?? "intent"; p.cases = []; }
  if (type === "split" && !data.branches) p.branches = [{ handle: `var_${Date.now()}_a`, weight: 50, label: "A" }, { handle: `var_${Date.now()}_b`, weight: 50, label: "B" }];
  if (type === "wait_reply" && data.timeoutMinutes == null) p.timeoutMinutes = 60;
  if (type === "delay" && data.minutes == null) p.minutes = 60;
  if (type === "tag" && !data.op) p.op = "add";
  if (type === "handoff" && !data.reason) p.reason = "customer_request";
  if (type === "set_var" && !data.transform) p.transform = "none";
  if (type === "ai_extract" && !data.fields) { p.fields = []; p.fieldPairs = []; p.sourceField = data.sourceField ?? "message.text"; }
  if (type === "api" && !data.method) { p.method = "GET"; p.outputKey = data.outputKey ?? "lastApi"; }
  if (type === "data" && !data.op) { p.op = "find"; p.filter = []; p.values = []; p.outputKey = data.outputKey ?? "data"; }
  if (type === "validate" && !data.field) { p.field = "message.text"; p.required = true; }
  if (type === "appointment" && data.days == null) { p.days = 7; p.text = data.text ?? "בחר מועד פנוי:"; p.buttonLabel = data.buttonLabel ?? "בחר מועד"; }
  if (type === "run_code" && !data.code) { p.code = "return state;"; p.outputKey = data.outputKey ?? "codeResult"; p.timeoutMs = 1000; }
  return p;
}

function SubtypeTabs({ subtypes, activeType, onPick }: { subtypes: SubType[]; activeType: string; onPick: (s: SubType) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
      {subtypes.map((sub) => {
        const active = sub.type === activeType;
        return (
          <button key={sub.type} onClick={() => onPick(sub)}
            style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 9px", borderRadius: 7, cursor: "pointer",
              background: active ? "var(--c-brand)" : "var(--bg-subtle)", color: active ? "#fff" : "var(--fg-secondary)",
              border: "1px solid", borderColor: active ? "var(--c-brand)" : "var(--border)" }}>
            {sub.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Inspector — block-driven (redesign §4.1) ──────────────────────
function NodeConfig(props: InspectorProps) {
  const { type, data, onMorph, onDelete } = props;
  const block = type === "start" ? null : blockForNode(type, data);
  const blockDef = block ? BLOCK_BY_ID.get(block) ?? null : null;
  const HeaderIcon = blockDef ? blockDef.icon : defFor(type).icon;
  const headerLabel = blockDef ? blockDef.label : defFor(type).label;
  const headerAccent = blockDef ? blockDef.accent : "var(--fg-secondary)";
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 26, height: 26, borderRadius: "var(--radius-md)", background: "var(--bg-subtle)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HeaderIcon size={14} color={headerAccent} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-primary)" }}>{headerLabel}</span>
        </div>
        <button onClick={onDelete} title="מחק" className="flow-iconbtn" style={{ background: "var(--c-danger-50)", border: "none", borderRadius: 6, padding: 5, cursor: "pointer" }}>
          <Trash2 size={13} color="var(--c-danger)" />
        </button>
      </div>

      {block && block !== "message" && blockDef && blockDef.subtypes.length > 0 && (
        <SubtypeTabs subtypes={blockDef.subtypes} activeType={type} onPick={(sub) => onMorph(sub.type, morphSeed(sub.type, data))} />
      )}

      {block === "message" ? <MessageComposer {...props} /> : <EngineFields {...props} />}
    </div>
  );
}

/** Datalist-backed input: pick an existing "memory" or type a new name (§4.3). */
function MemoryField({ value, memories, onChange, placeholder, pathMode }: { value: string; memories: string[]; onChange: (v: string) => void; placeholder?: string; pathMode?: boolean }) {
  const listId = useId();
  const options = pathMode
    ? [...memories.map((m) => ({ value: `state.${m}`, label: m })), ...MEMORY_BUILTINS]
    : memories.map((m) => ({ value: m, label: m }));
  return (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={listId} style={inputStyle} />
      <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
    </>
  );
}

function EngineFields(props: InspectorProps) {
  const { type, data, actions, templates, flowOpts, resourceOpts, collections, memories, nodeList, onChange, onMorph } = props;
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {type === "start" && (
          <Field label="מילת הפעלה" hint="כשלקוח כותב מילה זו — הזרימה מתחילה">
            <input value={s("keyword")} onChange={(e) => onChange({ keyword: e.target.value })} placeholder="שלום, היי..." style={inputStyle} />
          </Field>
        )}

        {(type === "message" || type === "ai" || type === "end") && (
          <Field label={type === "ai" ? "הוראה ל-AI (אופציונלי)" : type === "end" ? "הודעת סיום (אופציונלי)" : "תוכן ההודעה"}
            hint={type === "message" ? "אפשר משתנים: {{contact.firstName}}, {{state.x}}" : undefined}>
            <textarea value={s("text")} onChange={(e) => onChange({ text: e.target.value })} rows={4}
              placeholder={type === "ai" ? "ריק = תגובה חופשית מהידע" : "כתוב הודעה..."} style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }} />
          </Field>
        )}

        {type === "buttons" && <ButtonsConfig data={data} onChange={onChange} />}

        {type === "list" && (
          <>
            <Field label="תוכן ההודעה"><textarea value={s("text")} onChange={(e) => onChange({ text: e.target.value })} rows={2} placeholder="בחר אפשרות:" style={{ ...inputStyle, resize: "none" }} /></Field>
            <Field label="תווית הכפתור" hint="הטקסט שפותח את הרשימה"><input value={s("buttonLabel") || "בחר"} onChange={(e) => onChange({ buttonLabel: e.target.value.slice(0, 20) })} maxLength={20} style={inputStyle} /></Field>
            <Field label="כותרת הקטע (אופציונלי)"><input value={s("sectionTitle")} onChange={(e) => onChange({ sectionTitle: e.target.value })} style={inputStyle} /></Field>
            <RowsEditor rows={(data.rows as RowOpt[]) ?? []} onChange={(r) => onChange({ rows: r })} />
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>כל פריט מתפצל לענף נפרד.</p>
          </>
        )}

        {type === "template" && (
          <>
            <Field label="תבנית מאושרת">
              <select value={s("name")} onChange={(e) => { const t = templates.find((x) => x.name === e.target.value); onChange({ name: e.target.value, language: t?.language ?? "he" }); }} style={inputStyle}>
                <option value="">— בחר —</option>
                {templates.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.language})</option>)}
              </select>
            </Field>
            <Field label="משתנים (מופרד בפסיק → {{1}},{{2}})">
              <input value={s("variablesCsv")} onChange={(e) => onChange({ variablesCsv: e.target.value, variables: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="{{contact.firstName}}, ..." style={inputStyle} />
            </Field>
          </>
        )}

        {type === "media" && (
          <>
            <Field label="סוג מדיה">
              <select value={s("mediaKind") || "image"} onChange={(e) => onChange({ mediaKind: e.target.value })} style={inputStyle}>
                {MEDIA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="קישור (URL)" hint="כתובת ציבורית של הקובץ"><input value={s("link")} onChange={(e) => onChange({ link: e.target.value })} placeholder="https://..." style={inputStyle} /></Field>
            {(s("mediaKind") || "image") !== "audio" && (
              <Field label="כיתוב (אופציונלי)" hint="אפשר משתנים: {{state.x}}"><input value={s("caption")} onChange={(e) => onChange({ caption: e.target.value })} style={inputStyle} /></Field>
            )}
            {(s("mediaKind") || "image") === "document" && (
              <Field label="שם קובץ (אופציונלי)"><input value={s("filename")} onChange={(e) => onChange({ filename: e.target.value })} placeholder="catalog.pdf" style={inputStyle} /></Field>
            )}
          </>
        )}

        {type === "location" && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><Field label="קו רוחב (lat)"><input type="number" step="any" value={Number(data.latitude ?? 0)} onChange={(e) => onChange({ latitude: Number(e.target.value) })} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} /></Field></div>
              <div style={{ flex: 1 }}><Field label="קו אורך (lng)"><input type="number" step="any" value={Number(data.longitude ?? 0)} onChange={(e) => onChange({ longitude: Number(e.target.value) })} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} /></Field></div>
            </div>
            <Field label="שם המקום (אופציונלי)"><input value={s("name")} onChange={(e) => onChange({ name: e.target.value })} placeholder="המשרד שלנו" style={inputStyle} /></Field>
            <Field label="כתובת (אופציונלי)"><input value={s("address")} onChange={(e) => onChange({ address: e.target.value })} placeholder="רחוב הרצל 1, תל אביב" style={inputStyle} /></Field>
          </>
        )}

        {type === "question" && (
          <>
            <Field label="השאלה ללקוח"><textarea value={s("text")} onChange={(e) => onChange({ text: e.target.value })} rows={3} placeholder="מה האימייל שלך?" style={{ ...inputStyle, resize: "none" }} /></Field>
            <Field label="שמור את התשובה בשם" hint="בחר זיכרון קיים או כתוב שם חדש — תוכל להשתמש בו אחר כך בהחלטה">
              <MemoryField value={s("field")} memories={memories} onChange={(v) => onChange({ field: v })} placeholder="מייל הלקוח" />
            </Field>
          </>
        )}

        {type === "wait_reply" && (
          <>
            <Field label="הודעה ללקוח (אופציונלי)"><textarea value={s("text")} onChange={(e) => onChange({ text: e.target.value })} rows={2} placeholder="אנא השב תוך שעה" style={{ ...inputStyle, resize: "none" }} /></Field>
            <Field label="שמור את התשובה בשם (אופציונלי)"><MemoryField value={s("field")} memories={memories} onChange={(v) => onChange({ field: v })} placeholder="תשובה" /></Field>
            <Field label="פסק-זמן (דקות)" hint="אם אין תשובה עד אז — ענף 'לא ענה'"><input type="number" min={1} value={Number(data.timeoutMinutes ?? 60)} onChange={(e) => onChange({ timeoutMinutes: Number(e.target.value) })} style={inputStyle} /></Field>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>חבר ענף "ענה"/"לא ענה" לצמתים הבאים. דורש הרצת scheduler (`/api/jobs/drain`).</p>
          </>
        )}

        {type === "validate" && (
          <>
            <Field label="מה לבדוק" hint="בחר תשובה/פרט שנשמר, או ההודעה האחרונה">
              <MemoryField value={s("field") || "message.text"} memories={memories} pathMode onChange={(v) => onChange({ field: v })} />
            </Field>
            <Field label="סוג הבדיקה" hint="presets מתורגמים ל-regex אוטומטית">
              <select value={s("validatePreset") || "any"} onChange={(e) => { const p = VALIDATE_PRESETS.find((x) => x.value === e.target.value); onChange({ validatePreset: e.target.value, regex: p?.regex ?? "" }); }} style={inputStyle}>
                {VALIDATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={!!data.required} onChange={(e) => onChange({ required: e.target.checked })} /> שדה חובה
            </label>
            <Field label="תבנית מותאמת (regex) — מתקדם"><input value={s("regex")} onChange={(e) => onChange({ regex: e.target.value, validatePreset: "custom" })} placeholder="^[0-9]{9,10}$" style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><Field label="אורך מינ'"><input type="number" min={0} value={typeof data.minLength === "number" ? data.minLength : ""} onChange={(e) => onChange({ minLength: e.target.value === "" ? undefined : Number(e.target.value) })} style={inputStyle} /></Field></div>
              <div style={{ flex: 1 }}><Field label="אורך מקס'"><input type="number" min={0} value={typeof data.maxLength === "number" ? data.maxLength : ""} onChange={(e) => onChange({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} style={inputStyle} /></Field></div>
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>חבר ענף "תקין"/"לא תקין" לצמתים הבאים.</p>
          </>
        )}

        {type === "condition" && (
          <>
            <Field label="אם …" hint="בחר תשובה/פרט שנשמר קודם, או ההודעה האחרונה">
              <MemoryField value={s("condField")} memories={memories} pathMode onChange={(v) => setCond(onChange, data, { condField: v })} placeholder="מייל הלקוח" />
            </Field>
            <Field label="התנאי">
              <select value={s("condOp") || "eq"} onChange={(e) => setCond(onChange, data, { condOp: e.target.value })} style={inputStyle}>
                {HEB_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {s("condOp") !== "is_empty" && s("condOp") !== "is_not_empty" && (
              <Field label="ערך"><input value={s("condValue")} onChange={(e) => setCond(onChange, data, { condValue: e.target.value })} placeholder="@gmail.com" style={inputStyle} /></Field>
            )}
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>ייווצרו שני ענפים: ✅ כן · ⛔ לא.</p>
          </>
        )}

        {type === "switch" && (
          <>
            <Field label="שדה לבדיקה" hint="נתיב לערך — state.x, contact.status, message.text"><input value={s("field")} onChange={(e) => onChange({ field: e.target.value })} placeholder="state.choice" style={inputStyle} /></Field>
            <div>
              <label style={labelStyle}>ענפים לפי ערך</label>
              <CasesEditor cases={(data.cases as CaseOpt[]) ?? []} onChange={(c) => onChange({ cases: c })} valuePlaceholder="ערך (למשל premium)" />
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>ערך שלא תואם אף ענף → ענף "אחר".</p>
          </>
        )}

        {type === "split" && (
          <>
            <div>
              <label style={labelStyle}>וריאנטים (משקל יחסי)</label>
              <SplitEditor branches={(data.branches as SplitOpt[]) ?? []} onChange={(b) => onChange({ branches: b })} />
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>פיצול אקראי לפי המשקלים (לא חייב לסכום ל-100). שימושי ל-A/B testing.</p>
          </>
        )}

        {type === "delay" && (
          <Field label="המתנה (דקות)" hint="הזרימה תמשיך אוטומטית אחרי הזמן">
            <input type="number" min={1} value={Number(data.minutes ?? 60)} onChange={(e) => onChange({ minutes: Number(e.target.value) })} style={inputStyle} />
          </Field>
        )}

        {type === "set_field" && (
          <>
            <div>
              <label style={labelStyle}>זכור את הפרט…</label>
              <ModeSwitch options={[["perm", "לתמיד (כרטיס לקוח)"], ["session", "רק לשיחה הזו"]]} value="perm"
                onChange={(v) => { if (v === "session") onMorph("set_var", { target: s("field"), value: s("value"), transform: "none" }); }} />
            </div>
            <Field label="שם הפרט"><MemoryField value={s("field")} memories={memories} onChange={(v) => onChange({ field: v })} placeholder="שלב במשפך" /></Field>
            <Field label="ערך"><input value={s("value")} onChange={(e) => onChange({ value: e.target.value })} placeholder="lead" style={inputStyle} /></Field>
          </>
        )}

        {type === "set_var" && (
          <>
            <div>
              <label style={labelStyle}>זכור את הפרט…</label>
              <ModeSwitch options={[["perm", "לתמיד (כרטיס לקוח)"], ["session", "רק לשיחה הזו"]]} value="session"
                onChange={(v) => { if (v === "perm") onMorph("set_field", { field: s("target"), value: s("value") }); }} />
            </div>
            <Field label="שם המשתנה"><MemoryField value={s("target")} memories={memories} onChange={(v) => onChange({ target: v })} placeholder="greeting" /></Field>
            <Field label="ערך / ביטוי" hint="אפשר משתנים: {{contact.firstName}}, {{state.x}}"><input value={s("value")} onChange={(e) => onChange({ value: e.target.value })} placeholder="שלום {{contact.firstName}}" style={inputStyle} /></Field>
            <Field label="עיבוד">
              <select value={s("transform") || "none"} onChange={(e) => onChange({ transform: e.target.value })} style={inputStyle}>
                <option value="none">ללא</option>
                <option value="uppercase">אותיות גדולות</option>
                <option value="lowercase">אותיות קטנות</option>
                <option value="trim">הסרת רווחים</option>
                <option value="number">המרה למספר</option>
                <option value="date_now">תאריך/שעה נוכחיים</option>
              </select>
            </Field>
          </>
        )}

        {type === "tag" && (
          <>
            <Field label="פעולה">
              <select value={(data.op as string) || "add"} onChange={(e) => onChange({ op: e.target.value })} style={inputStyle}>
                <option value="add">הוסף תגית</option><option value="remove">הסר תגית</option>
              </select>
            </Field>
            <Field label="תגית"><input value={s("tag")} onChange={(e) => onChange({ tag: e.target.value })} placeholder="VIP" style={inputStyle} /></Field>
          </>
        )}

        {type === "action" && (
          <>
            <Field label="פעולה (Business Action)">
              <select value={s("actionId")} onChange={(e) => { const a = actions.find((x) => x.id === e.target.value); onChange({ actionId: e.target.value, actionLabel: a?.name ?? "" }); }} style={inputStyle}>
                <option value="">— בחר פעולה —</option>
                {actions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="שמור תוצאה למשתנה (אופציונלי)"><input value={s("outputKey")} onChange={(e) => onChange({ outputKey: e.target.value })} placeholder="lastAction" style={inputStyle} /></Field>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>חבר "הצלחה"/"שגיאה" לצמתים הבאים.</p>
          </>
        )}

        {type === "api" && <ApiConfig data={data} onChange={onChange} />}

        {type === "data" && <DataNodeConfig data={data} onChange={onChange} collections={collections} />}

        {type === "run_code" && (
          <>
            <Field label="קוד JavaScript" hint="זמינים: state, input. החזר ערך עם return.">
              <textarea value={s("code")} onChange={(e) => onChange({ code: e.target.value })} rows={7}
                placeholder={"return state.amount * 1.17;"} style={{ ...inputStyle, resize: "none", fontFamily: "monospace", direction: "ltr", textAlign: "left" }} />
            </Field>
            <Field label="שמור תוצאה למשתנה"><input value={s("outputKey") || "codeResult"} onChange={(e) => onChange({ outputKey: e.target.value })} placeholder="codeResult" style={inputStyle} /></Field>
            <Field label="זמן ריצה מרבי (ms)"><input type="number" min={50} max={5000} value={Number(data.timeoutMs ?? 1000)} onChange={(e) => onChange({ timeoutMs: Number(e.target.value) })} style={inputStyle} /></Field>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>רץ בארגז-חול מבודד (isolated-vm): ללא רשת/קבצים, מגבלת זיכרון וזמן. חבר ענף "הצלחה"/"שגיאה".</p>
          </>
        )}

        {type === "handoff" && (
          <Field label="סיבת ההעברה">
            <select value={s("reason") || "customer_request"} onChange={(e) => onChange({ reason: e.target.value })} style={inputStyle}>
              {["customer_request", "low_confidence", "sensitive_topic", "negative_sentiment", "no_skill"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}

        {type === "ai_classify" && (
          <>
            <Field label="שמור כוונה למשתנה" hint="הכוונה שזוהתה תישמר ב-state"><input value={s("outputKey") || "intent"} onChange={(e) => onChange({ outputKey: e.target.value })} placeholder="intent" style={inputStyle} /></Field>
            <div>
              <label style={labelStyle}>ענפים לפי כוונה</label>
              <CasesEditor cases={(data.cases as CaseOpt[]) ?? []} onChange={(c) => onChange({ cases: c })} valuePlaceholder="כוונה (למשל pricing_question)" />
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>ה-AI מסווג את הודעת הלקוח (snake_case). כוונה שלא תואמת → ענף "אחר".</p>
          </>
        )}

        {type === "ai_extract" && (
          <>
            <Field label="טקסט מקור" hint="נתיב לטקסט לחילוץ — בדרך כלל message.text"><input value={s("sourceField") || "message.text"} onChange={(e) => onChange({ sourceField: e.target.value })} style={inputStyle} /></Field>
            <div>
              <label style={labelStyle}>שדות לחילוץ</label>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 6px" }}>שם משתנה ← תיאור מה לחלץ (נשמר ל-state)</p>
              <PairEditor pairs={(data.fieldPairs as Array<{ k: string; v: string }>) ?? objToPairs(Object.fromEntries(((data.fields as Array<{ key: string; description?: string }>) ?? []).map((f) => [f.key, f.description ?? ""])))}
                kPlaceholder="email" vPlaceholder="כתובת המייל של הלקוח" addLabel="הוסף שדה"
                onChange={(p) => onChange({ fieldPairs: p, fields: p.filter((x) => x.k.trim()).map((x) => ({ key: x.k.trim(), description: x.v })) })} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={!!data.writeToContact} onChange={(e) => onChange({ writeToContact: e.target.checked })} /> שמור גם כשדות לקוח
            </label>
          </>
        )}

        {type === "appointment" && (
          <>
            <Field label="משאב (יומן)">
              <select value={s("resourceId")} onChange={(e) => { const r = resourceOpts.find((x) => x.id === e.target.value); onChange({ resourceId: e.target.value, resourceName: r?.name ?? "" }); }} style={inputStyle}>
                <option value="">— בחר משאב —</option>
                {resourceOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            {resourceOpts.length === 0 && <p style={{ fontSize: 10, color: "var(--text-muted)" }}>אין משאבים. צור משאב דרך POST /api/appointments/resources.</p>}
            <Field label="תוכן ההודעה"><textarea value={s("text")} onChange={(e) => onChange({ text: e.target.value })} rows={2} placeholder="בחר מועד פנוי:" style={{ ...inputStyle, resize: "none" }} /></Field>
            <Field label="תווית הכפתור"><input value={s("buttonLabel") || "בחר מועד"} onChange={(e) => onChange({ buttonLabel: e.target.value.slice(0, 20) })} maxLength={20} style={inputStyle} /></Field>
            <Field label="טווח חיפוש (ימים)" hint="כמה ימים קדימה לחפש מועדים פנויים"><input type="number" min={1} max={60} value={Number(data.days ?? 7)} onChange={(e) => onChange({ days: Number(e.target.value) })} style={inputStyle} /></Field>
            <Field label="הודעה כשאין מועדים (אופציונלי)"><input value={s("noSlotsText")} onChange={(e) => onChange({ noSlotsText: e.target.value })} placeholder="אין מועדים פנויים כרגע" style={inputStyle} /></Field>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>הצומת מציג מועדים פנויים, ממתין לבחירה וקובע. חבר ענף "נקבע"/"נכשל".</p>
          </>
        )}

        {type === "jump" && (
          <>
            <Field label="תהליך יעד">
              <select value={s("targetFlowId")} onChange={(e) => { const f = flowOpts.find((x) => x.id === e.target.value); onChange({ targetFlowId: e.target.value, targetFlowName: f?.name ?? "" }); }} style={inputStyle}>
                <option value="">— בחר תהליך —</option>
                {flowOpts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            {flowOpts.length === 0 && <p style={{ fontSize: 10, color: "var(--text-muted)" }}>אין תהליכים אחרים לבחירה. שמור תהליך נוסף תחילה.</p>}
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>הזרימה הנוכחית תיעצר והתהליך היעד יתחיל. היעד חייב להיות פעיל. חבר ענף "נכשל" למקרה שלא נמצא/כבוי.</p>
          </>
        )}

        {type === "jump_to_node" && (
          <>
            <Field label="צומת יעד">
              <select value={s("targetNodeId")} onChange={(e) => { const n = nodeList.find((x) => x.id === e.target.value); onChange({ targetNodeId: e.target.value, targetNodeLabel: n?.label ?? "" }); }} style={inputStyle}>
                <option value="">— בחר צומת —</option>
                {nodeList.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </Field>
            <p style={{ fontSize: 10, color: "var(--text-muted)" }}>קופץ לצומת אחר באותו תהליך (לולאות/קיצורים). שמור מסלול-יציאה — הריצה מוגבלת ל-25 צעדים.</p>
          </>
        )}

        {type === "stop" && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>הצומת עוצר את הזרימה מיידית, בלי הודעה.</p>}
      </div>
  );
}

/** Keep the human-friendly cond* fields AND the engine's `condition` expr in sync. */
function setCond(onChange: (u: NodeData) => void, data: NodeData, patch: NodeData) {
  const merged = { ...data, ...patch };
  onChange({
    ...patch,
    condition: { op: "AND", rules: [{ field: merged.condField ?? "", operator: merged.condOp ?? "eq", value: merged.condValue ?? "" }], groups: [] },
  });
}

function CasesEditor({ cases, onChange, valuePlaceholder }: { cases: CaseOpt[]; onChange: (c: CaseOpt[]) => void; valuePlaceholder: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {cases.map((c, i) => (
        <div key={c.handle} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#EDE9FE", fontSize: 10, fontWeight: 700, color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
          <input value={c.value} onChange={(e) => { const n = [...cases]; n[i] = { ...n[i], value: e.target.value }; onChange(n); }} placeholder={valuePlaceholder} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }} />
          <button onClick={() => onChange(cases.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...cases, { value: "", handle: `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }])} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>+ ענף</button>
    </div>
  );
}

function RowsEditor({ rows, onChange }: { rows: RowOpt[]; onChange: (r: RowOpt[]) => void }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>פריטים (מקס. 10)</label>
        <button onClick={() => { if (rows.length >= 10) return; onChange([...rows, { id: `row_${Date.now()}`, title: "" }]); }}
          disabled={rows.length >= 10} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", opacity: rows.length >= 10 ? 0.4 : 1 }}>+ הוסף</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, border: "1px solid var(--bg-border)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#CFFAFE", fontSize: 10, fontWeight: 700, color: "#0E7490", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <input value={r.title} onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], title: e.target.value.slice(0, 24) }; onChange(n); }} placeholder={`כותרת ${i + 1}`} maxLength={24} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }} />
              <button onClick={() => onChange(rows.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
            </div>
            <input value={r.description ?? ""} onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], description: e.target.value.slice(0, 72) }; onChange(n); }} placeholder="תיאור (אופציונלי)" maxLength={72} style={{ ...inputStyle, padding: "4px 8px", fontSize: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitEditor({ branches, onChange }: { branches: SplitOpt[]; onChange: (b: SplitOpt[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {branches.map((b, i) => (
        <div key={b.handle} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <input value={b.label} onChange={(e) => { const n = [...branches]; n[i] = { ...n[i], label: e.target.value }; onChange(n); }} placeholder={`וריאנט ${i + 1}`} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }} />
          <input type="number" min={0} value={b.weight} onChange={(e) => { const n = [...branches]; n[i] = { ...n[i], weight: Number(e.target.value) }; onChange(n); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11, width: 58, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>%</span>
          <button onClick={() => onChange(branches.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...branches, { handle: `var_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, weight: 0, label: "" }])} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>+ וריאנט</button>
    </div>
  );
}

function pairsToObj(pairs: Array<{ k: string; v: string }>): Record<string, string> {
  return Object.fromEntries(pairs.filter((p) => p.k.trim()).map((p) => [p.k.trim(), p.v]));
}
function objToPairs(obj: unknown): Array<{ k: string; v: string }> {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).map(([k, v]) => ({ k, v: String(v ?? "") }));
}

function PairEditor({ pairs, onChange, kPlaceholder, vPlaceholder, addLabel }: {
  pairs: Array<{ k: string; v: string }>;
  onChange: (pairs: Array<{ k: string; v: string }>) => void;
  kPlaceholder: string; vPlaceholder: string; addLabel: string;
}) {
  const cell: React.CSSProperties = { ...inputStyle, padding: "5px 8px", fontSize: 11 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <input value={p.k} onChange={(e) => { const n = [...pairs]; n[i] = { ...n[i], k: e.target.value }; onChange(n); }} placeholder={kPlaceholder} style={cell} />
          <input value={p.v} onChange={(e) => { const n = [...pairs]; n[i] = { ...n[i], v: e.target.value }; onChange(n); }} placeholder={vPlaceholder} style={cell} />
          <button onClick={() => onChange(pairs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...pairs, { k: "", v: "" }])} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>+ {addLabel}</button>
    </div>
  );
}

// ── Data node config ([קטגוריה 28]) ───────────────────────────────
const FILTER_OPS: { value: string; label: string }[] = [
  { value: "eq", label: "שווה" },
  { value: "neq", label: "לא שווה" },
  { value: "contains", label: "מכיל" },
  { value: "gt", label: "גדול מ" },
  { value: "gte", label: "גדול/שווה" },
  { value: "lt", label: "קטן מ" },
  { value: "lte", label: "קטן/שווה" },
  { value: "in", label: "אחד מ" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
];

function DataNodeConfig({ data, onChange, collections }: { data: NodeData; onChange: (u: NodeData) => void; collections: CollectionOpt[] }) {
  const op = String(data.op ?? "find");
  const collName = String(data.collection ?? "");
  const coll = collections.find((c) => c.name === collName) ?? null;
  const fields = coll?.fields ?? [];
  const filter = (data.filter as Array<{ field: string; op: string; value?: string }>) ?? [];
  const values = (data.values as Array<{ key: string; value?: string }>) ?? [];
  const needsFilter = op !== "insert";
  const needsValues = op === "insert" || op === "update";

  const rowBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 };
  const addBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 9px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", alignSelf: "flex-start" };
  const fieldOpts = (cur: string) => (
    <>
      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      {cur && !fields.some((f) => f.key === cur) ? <option value={cur}>{cur}</option> : null}
    </>
  );

  return (
    <>
      <Field label="טבלת נתונים">
        <select value={collName} onChange={(e) => onChange({ collection: e.target.value })} style={inputStyle}>
          <option value="">— בחר טבלה —</option>
          {collections.map((c) => <option key={c.id} value={c.name}>{c.label}</option>)}
        </select>
      </Field>
      {collections.length === 0 && (
        <p style={{ fontSize: 10.5, color: "var(--c-warning)", marginTop: -6 }}>אין עדיין טבלאות — צור אותן באזור "מאגרי מידע".</p>
      )}

      <Field label="פעולה">
        <select value={op} onChange={(e) => onChange({ op: e.target.value })} style={inputStyle}>
          {DATA_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {needsFilter && (
        <Field label={op === "find" || op === "get" ? "סינון — אילו שורות" : "על אילו שורות לפעול"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filter.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <select value={row.field} onChange={(e) => onChange({ filter: filter.map((r, j) => (j === i ? { ...r, field: e.target.value } : r)) })} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                  <option value="">שדה</option>{fieldOpts(row.field)}
                </select>
                <select value={row.op} onChange={(e) => onChange({ filter: filter.map((r, j) => (j === i ? { ...r, op: e.target.value } : r)) })} style={{ ...inputStyle, width: 86 }}>
                  {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {row.op !== "is_empty" && row.op !== "is_not_empty" && (
                  <input value={row.value ?? ""} onChange={(e) => onChange({ filter: filter.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)) })} placeholder="ערך / {{state.x}}" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                )}
                <button onClick={() => onChange({ filter: filter.filter((_, j) => j !== i) })} style={rowBtn}><Trash2 size={12} color="#EF4444" /></button>
              </div>
            ))}
            <button onClick={() => onChange({ filter: [...filter, { field: fields[0]?.key ?? "", op: "eq", value: "" }] })} style={addBtn}><Plus size={12} /> תנאי</button>
          </div>
        </Field>
      )}

      {needsValues && (
        <Field label="ערכים לכתיבה">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {values.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <select value={row.key} onChange={(e) => onChange({ values: values.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)) })} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                  <option value="">שדה</option>{fieldOpts(row.key)}
                </select>
                <input value={row.value ?? ""} onChange={(e) => onChange({ values: values.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)) })} placeholder="ערך / {{state.x}}" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                <button onClick={() => onChange({ values: values.filter((_, j) => j !== i) })} style={rowBtn}><Trash2 size={12} color="#EF4444" /></button>
              </div>
            ))}
            <button onClick={() => onChange({ values: [...values, { key: fields[0]?.key ?? "", value: "" }] })} style={addBtn}><Plus size={12} /> שדה</button>
          </div>
        </Field>
      )}

      {op === "increment" && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Field label="שדה מונה">
              <select value={String(data.field ?? "")} onChange={(e) => onChange({ field: e.target.value })} style={inputStyle}>
                <option value="">שדה</option>{fieldOpts(String(data.field ?? ""))}
              </select>
            </Field>
          </div>
          <div style={{ width: 96 }}>
            <Field label="כמות (±)"><input value={String(data.amount ?? "")} onChange={(e) => onChange({ amount: e.target.value })} placeholder="-1" style={inputStyle} /></Field>
          </div>
        </div>
      )}

      {op === "aggregate" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Field label="חישוב">
                <select value={String(data.metric ?? "count")} onChange={(e) => onChange({ metric: e.target.value })} style={inputStyle}>
                  {DATA_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            </div>
            {String(data.metric ?? "count") !== "count" && (
              <div style={{ flex: 1 }}>
                <Field label="שדה מספרי">
                  <select value={String(data.field ?? "")} onChange={(e) => onChange({ field: e.target.value })} style={inputStyle}>
                    <option value="">שדה</option>{fieldOpts(String(data.field ?? ""))}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <Field label="קיבוץ לפי (אופציונלי)">
            <select value={String(data.groupBy ?? "")} onChange={(e) => onChange({ groupBy: e.target.value })} style={inputStyle}>
              <option value="">— ללא קיבוץ —</option>{fieldOpts(String(data.groupBy ?? ""))}
            </select>
          </Field>
          <p style={{ fontSize: 10, color: "var(--text-muted)" }}>ללא קיבוץ: התוצאה ב-{`{{state.<שם>Value}}`}. עם קיבוץ: מערך {`{group, value}`} ב-{`{{state.<שם>}}`}.</p>
        </>
      )}

      {(op === "find" || op === "get") && fields.some((f) => f.type === "reference") && (
        <Field label="פתח הפניות (אופציונלי)" hint="שמות שדות-הפניה, מופרדים בפסיק — נטענים תחת <שדה>__ref">
          <input value={String(data.expand ?? "")} onChange={(e) => onChange({ expand: e.target.value })} placeholder="roomType, owner" style={inputStyle} />
        </Field>
      )}

      <Field label="שמור תוצאה למשתנה" hint="זמין בהמשך כ-{{state.<שם>}}">
        <input value={String(data.outputKey ?? "")} onChange={(e) => onChange({ outputKey: e.target.value })} placeholder="data" style={inputStyle} />
      </Field>
      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {op === "find" || op === "get" || op === "aggregate" ? 'חבר "נמצא" / "ריק" לצמתים הבאים.' : 'חבר "הצלחה" / "שגיאה" לצמתים הבאים.'}
      </p>
    </>
  );
}

function ApiConfig({ data, onChange }: { data: NodeData; onChange: (u: NodeData) => void }) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  const headerPairs = (data.headerPairs as Array<{ k: string; v: string }>) ?? objToPairs(data.headers);
  const mappingPairs = (data.mappingPairs as Array<{ k: string; v: string }>) ?? objToPairs(data.responseMapping);
  const method = (s("method") || "GET").toUpperCase();
  const [bodyErr, setBodyErr] = useState(false);
  return (
    <>
      <Field label="Method">
        <select value={method} onChange={(e) => onChange({ method: e.target.value })} style={inputStyle}>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="כתובת (URL)" hint="אפשר משתנים: {{state.x}}, {{contact.x}}">
        <input value={s("url")} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://api.example.com/..." style={inputStyle} />
      </Field>
      <div>
        <label style={labelStyle}>Headers</label>
        <PairEditor pairs={headerPairs} kPlaceholder="Authorization" vPlaceholder="Bearer {{state.token}}" addLabel="הוסף header"
          onChange={(p) => onChange({ headerPairs: p, headers: pairsToObj(p) })} />
      </div>
      {method !== "GET" && (
        <Field label="גוף הבקשה (JSON)" hint={bodyErr ? "⚠ JSON לא תקין — לא יישמר" : "אובייקט JSON; ערכים תומכים ב-{{...}}"}>
          <textarea value={typeof data.bodyText === "string" ? data.bodyText : (data.body ? JSON.stringify(data.body, null, 2) : "")} rows={4}
            onChange={(e) => {
              const text = e.target.value;
              const patch: NodeData = { bodyText: text };
              if (!text.trim()) { patch.body = undefined; setBodyErr(false); }
              else { try { patch.body = JSON.parse(text); setBodyErr(false); } catch { setBodyErr(true); } }
              onChange(patch);
            }}
            placeholder={'{\n  "email": "{{state.email}}"\n}'} style={{ ...inputStyle, resize: "none", fontFamily: "monospace", direction: "ltr", textAlign: "left" }} />
        </Field>
      )}
      <Field label="שמור תגובה למשתנה"><input value={s("outputKey")} onChange={(e) => onChange({ outputKey: e.target.value })} placeholder="lastApi" style={inputStyle} /></Field>
      <div>
        <label style={labelStyle}>מיפוי תשובה → state</label>
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 6px" }}>שם משתנה ← נתיב בתשובה (למשל data.id)</p>
        <PairEditor pairs={mappingPairs} kPlaceholder="userId" vPlaceholder="data.id" addLabel="הוסף מיפוי"
          onChange={(p) => onChange({ mappingPairs: p, responseMapping: pairsToObj(p) })} />
      </div>
      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>חבר "הצלחה"/"שגיאה" לצמתים הבאים.</p>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function ButtonsConfig({ data, onChange }: { data: NodeData; onChange: (u: NodeData) => void }) {
  const buttons = (data.buttons as ButtonOpt[]) ?? [];
  return (
    <>
      <Field label="תוכן ההודעה"><textarea value={(data.text as string) ?? ""} onChange={(e) => onChange({ text: e.target.value })} rows={3} placeholder="בחר אפשרות:" style={{ ...inputStyle, resize: "none" }} /></Field>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>כפתורים (מקס. 3)</label>
          <button onClick={() => { if (buttons.length >= 3) return; onChange({ buttons: [...buttons, { id: `btn_${Date.now()}`, label: "" }] }); }}
            disabled={buttons.length >= 3} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--accent-light)", color: "var(--accent-dark)", border: "none", cursor: "pointer", opacity: buttons.length >= 3 ? 0.4 : 1 }}>+ הוסף</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {buttons.map((btn, i) => (
            <div key={btn.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#FDE68A", fontSize: 10, fontWeight: 700, color: "#92400E", flexShrink: 0 }}>{i + 1}</div>
              <input value={btn.label} onChange={(e) => { const b = [...buttons]; b[i] = { ...b[i], label: e.target.value.slice(0, 20) }; onChange({ buttons: b }); }}
                placeholder={`כפתור ${i + 1}`} maxLength={20} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }} />
              <button onClick={() => onChange({ buttons: buttons.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Message composer (redesign §2.3, §4.2) ───────────────────────
function ModeSwitch<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg-sunken)", padding: 3, borderRadius: 9 }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)}
          style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: "5px 6px", borderRadius: 6, cursor: "pointer", border: "none",
            background: value === val ? "var(--bg-surface)" : "transparent", color: value === val ? "var(--fg-primary)" : "var(--fg-muted)",
            boxShadow: value === val ? "var(--elev-1)" : "none" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const HEADER_OPTS: [HeaderKind, string][] = [["none", "ללא"], ["text", "טקסט"], ["image", "תמונה"], ["video", "וידאו"], ["document", "מסמך"]];

function MessageComposer({ type, data, templates, onChange, onMorph, onSplitMedia }: InspectorProps) {
  // Hydrate AI-/legacy-built engine nodes (which lack the composer's part fields)
  // into the composer's authoring shape so e.g. a `buttons` node opens with its buttons.
  const d = hydrateMessage(type, data);
  const mode = (d.msgMode as MsgMode) ?? "rich";
  const headerKind = (d.headerKind as HeaderKind) ?? "none";
  const interactive = (d.interactive as MsgInteractive) ?? "none";
  const buttons = (d.buttons as ButtonOpt[]) ?? [];
  const rows = (d.rows as RowOpt[]) ?? [];
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  // Re-normalize parts → engine type on every change so node.type tracks the composition.
  const set = (patch: NodeData) => { const norm = normalizeMessage({ ...d, ...patch }); onMorph(norm.type, norm.data); };
  const note = envelopeNote(d);
  const overflow = interactive === "list" && headerKind !== "none" && headerKind !== "text";
  const previewType = normalizeMessage(d).type;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ModeSwitch options={[["rich", "טקסט / מדיה"], ["location", "מיקום"], ["template", "תבנית"]]} value={mode} onChange={(v) => set({ msgMode: v })} />

      {mode === "template" && (
        <>
          <Field label="תבנית מאושרת">
            <select value={s("name")} onChange={(e) => { const t = templates.find((x) => x.name === e.target.value); onChange({ name: e.target.value, language: t?.language ?? "he" }); }} style={inputStyle}>
              <option value="">— בחר —</option>
              {templates.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.language})</option>)}
            </select>
          </Field>
          <Field label="משתנים (מופרד בפסיק → {{1}},{{2}})">
            <input value={s("variablesCsv")} onChange={(e) => onChange({ variablesCsv: e.target.value, variables: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="{{contact.firstName}}, ..." style={inputStyle} />
          </Field>
        </>
      )}

      {mode === "location" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Field label="קו רוחב (lat)"><input type="number" step="any" value={Number(d.latitude ?? 0)} onChange={(e) => onChange({ latitude: Number(e.target.value) })} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} /></Field></div>
            <div style={{ flex: 1 }}><Field label="קו אורך (lng)"><input type="number" step="any" value={Number(d.longitude ?? 0)} onChange={(e) => onChange({ longitude: Number(e.target.value) })} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} /></Field></div>
          </div>
          <Field label="שם המקום (אופציונלי)"><input value={s("name")} onChange={(e) => onChange({ name: e.target.value })} placeholder="המשרד שלנו" style={inputStyle} /></Field>
          <Field label="כתובת (אופציונלי)"><input value={s("address")} onChange={(e) => onChange({ address: e.target.value })} placeholder="רחוב הרצל 1, תל אביב" style={inputStyle} /></Field>
        </>
      )}

      {mode === "rich" && (
        <>
          <div>
            <label style={labelStyle}>כותרת (אופציונלי)</label>
            <ModeSwitch options={HEADER_OPTS} value={headerKind} onChange={(v) => set({ headerKind: v })} />
            {headerKind === "text" && <input value={s("headerText")} onChange={(e) => set({ headerText: e.target.value })} placeholder="כותרת קצרה (עד 60)" maxLength={60} style={{ ...inputStyle, marginTop: 6 }} />}
            {(headerKind === "image" || headerKind === "video" || headerKind === "document") && (
              <>
                <input value={s("headerLink")} onChange={(e) => set({ headerLink: e.target.value })} placeholder="קישור URL לקובץ" style={{ ...inputStyle, marginTop: 6, direction: "ltr", textAlign: "left" }} />
                {headerKind === "document" && <input value={s("headerFilename")} onChange={(e) => set({ headerFilename: e.target.value })} placeholder="שם קובץ (catalog.pdf)" style={{ ...inputStyle, marginTop: 6 }} />}
              </>
            )}
          </div>

          <div>
            <label style={labelStyle}>גוף ההודעה</label>
            <textarea value={s("text")} onChange={(e) => set({ text: e.target.value })} rows={3} placeholder="כתוב הודעה..." style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }} />
            <DetailChips onInsert={(tok) => set({ text: (s("text") + " " + tok).trim() })} />
          </div>

          <div>
            <label style={labelStyle}>פעולה (בחר אחת)</label>
            <ModeSwitch options={[["none", "ללא"], ["buttons", "כפתורים"], ["list", "תפריט"]]} value={interactive} onChange={(v) => set({ interactive: v })} />
            {interactive === "buttons" && <ButtonRows buttons={buttons} onChange={(b) => set({ buttons: b })} />}
            {interactive === "list" && (
              <>
                <Field label="תווית הכפתור הפותח"><input value={s("buttonLabel") || "בחר"} onChange={(e) => set({ buttonLabel: e.target.value.slice(0, 20) })} maxLength={20} style={{ ...inputStyle, marginTop: 6 }} /></Field>
                <RowsEditor rows={rows} onChange={(r) => set({ rows: r })} />
              </>
            )}
            {interactive === "buttons" && <p style={{ fontSize: 10, color: "var(--fg-muted)", marginTop: 4 }}>כל כפתור = ענף נפרד בקנבס. (עד 3 — מגבלת WhatsApp)</p>}
          </div>

          <Field label="כיתוב תחתון (אופציונלי)"><input value={s("footer")} onChange={(e) => set({ footer: e.target.value.slice(0, 60) })} maxLength={60} placeholder="עד 60 תווים" style={inputStyle} /></Field>

          <div>
            <label style={labelStyle}>תצוגה מקדימה</label>
            <MiniBubble type={previewType} data={d} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: note.ok ? "var(--c-brand-strong)" : "var(--c-warning)" }}>
            {note.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {note.text}
          </div>
          {overflow && (
            <button onClick={onSplitMedia} style={{ fontSize: 12, fontWeight: 600, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--c-warning)", background: "var(--c-warning-50)", color: "var(--c-warning)", cursor: "pointer" }}>
              פצל ל-2 צמתים (תמונה → תפריט)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DetailChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>הוסף פרט:</span>
      {DETAIL_CHIPS.map((c) => (
        <button key={c.token} onClick={() => onInsert(c.token)}
          style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, border: "1px solid var(--c-brand-100)", background: "var(--c-brand-50)", color: "var(--c-brand-strong)", cursor: "pointer" }}>
          + {c.label}
        </button>
      ))}
    </div>
  );
}

function ButtonRows({ buttons, onChange }: { buttons: ButtonOpt[]; onChange: (b: ButtonOpt[]) => void }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {buttons.map((btn, i) => (
          <div key={btn.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "var(--bg-sunken)", fontSize: 10, fontWeight: 700, color: "var(--fg-secondary)", flexShrink: 0 }}>{i + 1}</div>
            <input value={btn.label} onChange={(e) => { const b = [...buttons]; b[i] = { ...b[i], label: e.target.value.slice(0, 20) }; onChange(b); }} placeholder={`כפתור ${i + 1}`} maxLength={20} style={{ ...inputStyle, padding: "5px 8px", fontSize: 11 }} />
            <button onClick={() => onChange(buttons.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={12} color="#EF4444" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => { if (buttons.length >= 3) return; onChange([...buttons, { id: `btn_${Date.now()}`, label: "" }]); }}
        disabled={buttons.length >= 3} style={{ marginTop: 6, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--c-brand-50)", color: "var(--c-brand-strong)", border: "none", cursor: buttons.length >= 3 ? "default" : "pointer", opacity: buttons.length >= 3 ? 0.4 : 1 }}>
        + כפתור
      </button>
    </div>
  );
}

// ── Phone preview — the WhatsApp twin-screen (§3) ─────────────────
function PhonePreview({ node, onClose }: { node: Node<NodeData> | null; onClose: () => void }) {
  const type = node?.type ?? "";
  const isMsg = node ? MSG_FAMILY.has(type) && type !== "location" && type !== "template" : false;
  return (
    <div style={{ width: 300, borderRight: "1px solid var(--border)", background: "var(--bg-subtle)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Smartphone size={15} color="var(--c-brand)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-primary)", flex: 1 }}>תצוגה מקדימה</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={15} color="var(--fg-muted)" /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 232, borderRadius: 26, border: "8px solid #111827", background: "#E5DDD5", minHeight: 380, padding: "12px 10px", boxShadow: "var(--elev-3)" }}>
          <div style={{ background: "var(--c-brand)", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>WhatsApp</div>
          {node ? (
            isMsg
              ? <div style={{ maxWidth: "94%" }}><MiniBubble type={type} data={node.data as NodeData} /></div>
              : <div style={{ background: "#fff", borderRadius: 10, padding: "8px 10px", fontSize: 11.5, color: "var(--fg-secondary)", maxWidth: "94%" }}>{summaryFor(type, node.data as NodeData) || defFor(type).label}</div>
          ) : (
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", textAlign: "center", marginTop: 30 }}>בחר שלב כדי לראות איך הוא ייראה ללקוח</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List + Page ────────────────────────────────────────────────────
function makeNewFlow(): BuilderFlowT {
  const id = `flow_${Date.now()}`;
  // Seed only Start — the onboarding two-doors (§3.5) drives the first real step,
  // instead of teaching the fragmented 3-node model from second one.
  return {
    id, name: "תהליך חדש", active: false, updatedAt: new Date().toISOString(),
    nodes: [
      { id: "s1", type: "start", position: { x: 280, y: 60 }, data: { nodeType: "start", label: "התחלה", keyword: "שלום" } },
    ],
    edges: [],
  };
}

function FlowList({ flows, onCreate, onEdit, onDelete }: { flows: BuilderFlowT[]; onCreate: () => void; onEdit: (f: BuilderFlowT) => void; onDelete: (id: string) => Promise<void> }) {
  const activeCount = flows.filter((flow) => flow.active).length;
  const stepCount = flows.reduce((sum, flow) => sum + flow.nodes.length, 0);
  const [deleteTarget, setDeleteTarget] = useState<BuilderFlowT | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError(null);
    try { await onDelete(deleteTarget.id); setDeleteTarget(null); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "המחיקה נכשלה"); }
    finally { setDeleting(false); }
  }
  return (
    <div className="flow-home-v2">
      <header className="flow-home-head">
        <div><span>AUTOMATION STUDIO</span><h1>תהליכים</h1><p>בונים את הדרך שבה העסק מדבר, מחליט ופועל — הודעה אחר הודעה.</p></div>
        <button onClick={onCreate}><Plus size={16} /> תהליך חדש</button>
      </header>

      <section className="flow-home-hero">
        <div className="flow-home-copy">
          <span><Sparkles size={14} /> בונה שיחות חכם</span>
          <h2>משיחה ראשונה<br />לפעולה אמיתית.</h2>
          <p>חבר הודעות, שאלות, החלטות ופעולות למסלול אחד. כל הודעה נבדקת מול WhatsApp ומוצגת בדיוק כפי שהלקוח יקבל אותה.</p>
          <button onClick={onCreate}><GitBranch size={15} /> מתחילים לבנות</button>
        </div>
        <div className="flow-home-visual" aria-hidden="true">
          <div className="flow-visual-node start"><Zap /><span>הודעה נכנסת</span></div><i />
          <div className="flow-visual-node message"><MessageSquare /><span>שליחת הודעה</span></div><i />
          <div className="flow-visual-node branch"><GitFork /><span>בחירת מסלול</span></div>
          <div className="flow-visual-split"><span>כן</span><span>לא</span></div>
        </div>
      </section>

      <section className="flow-home-stats">
        <div><small>סה״כ תהליכים</small><b>{flows.length}</b></div>
        <div><small>תהליכים פעילים</small><b>{activeCount}</b></div>
        <div><small>שלבים שנבנו</small><b>{stepCount}</b></div>
      </section>

      <div className="flow-list-title"><div><span>הספרייה שלי</span><b>{flows.length} תהליכים</b></div><p>לחץ על תהליך כדי להמשיך לערוך אותו</p></div>

      {flows.length === 0 ? (
        <div className="flow-home-empty">
          <span><GitBranch size={25} /></span><small>הקנבס מוכן</small><h3>התהליך הראשון שלך מתחיל כאן</h3>
          <p>אפשר להתחיל מתיאור ל־AI או לבנות ידנית שלב אחר שלב.</p><button onClick={onCreate}>צור תהליך ראשון</button>
        </div>
      ) : (
        <div className="flow-home-grid">
          {flows.map((flow) => (
            <article key={flow.id} onClick={() => onEdit(flow)}>
              <div className="flow-card-top"><span className={flow.active ? "live" : ""}>{flow.active ? "פעיל" : "טיוטה"}</span><small>{flow.updatedAt ? new Date(flow.updatedAt).toLocaleDateString("he-IL") : "חדש"}</small></div>
              <div className="flow-card-map" aria-hidden="true"><i /><b /><i /><em /></div>
              <h3>{flow.name}</h3>
              <p>{flow.nodes.length} שלבים · {flow.edges.length} חיבורים</p>
              <footer>
                <button onClick={(event) => { event.stopPropagation(); onEdit(flow); }}><Edit2 size={13} /> פתיחה בסטודיו</button>
                <button aria-label="מחיקת תהליך" onClick={(event) => { event.stopPropagation(); setDeleteTarget(flow); }}><Trash2 size={14} /></button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {deleteTarget && <div className="flow-confirm-back" onClick={() => !deleting && setDeleteTarget(null)}><div onClick={(event) => event.stopPropagation()}><span><Trash2 size={18} /></span><small>מחיקת תהליך</small><h3>למחוק את “{deleteTarget.name}”?</h3><p>התהליך והגרסאות שלו יוסרו. הפעולה אינה ניתנת לביטול.</p>{deleteError && <em>{deleteError}</em>}<footer><button onClick={() => setDeleteTarget(null)} disabled={deleting}>ביטול</button><button onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {deleting ? "מוחק..." : "מחיקה"}</button></footer></div></div>}
    </div>
  );
}

export default function FlowsPage() {
  const [mode, setMode] = useState<"list" | "builder">("list");
  const [flows, setFlows] = useState<BuilderFlowT[]>([]);
  const [editing, setEditing] = useState<BuilderFlowT | null>(null);

  useEffect(() => {
    fetch("/api/flows").then((r) => r.ok ? r.json() : { flows: [] }).then((d) => setFlows(d.flows ?? [])).catch(() => {});
  }, []);

  async function handleSave(flow: BuilderFlowT): Promise<void> {
    const response = await fetch("/api/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flow) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? `שמירה נכשלה (${response.status})`); }
    setFlows((fs) => (fs.some((f) => f.id === flow.id) ? fs.map((f) => (f.id === flow.id ? flow : f)) : [...fs, flow]));
    setEditing(flow);
  }
  async function handleDelete(id: string): Promise<void> {
    const response = await fetch(`/api/flows?id=${id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? `מחיקה נכשלה (${response.status})`); }
    setFlows((fs) => fs.filter((f) => f.id !== id));
  }

  if (mode === "builder" && editing) {
    return <FlowBuilder flow={editing} onBack={() => { setMode("list"); setEditing(null); }} onSave={handleSave} />;
  }
  return <FlowList flows={flows} onCreate={() => { setEditing(makeNewFlow()); setMode("builder"); }} onEdit={(f) => { setEditing(f); setMode("builder"); }} onDelete={handleDelete} />;
}
