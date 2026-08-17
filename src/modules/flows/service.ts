/**
 * Flow engine — [קטגוריה 8].
 *
 * Executes a Flow graph for a conversation, persisting the FlowRun so "wait"
 * nodes survive across inbound messages (the old engine kept this in memory —
 * IMPLEMENTATION.md §4). Delegates side effects to the owning modules:
 * messaging → whatsapp, fields/tags → contacts, templates → templates,
 * ai → ai, handoff → handoff.
 */
import { evaluate, type ConditionExpr, type EvaluationContext } from "@/modules/conditions";
import { sendButtons, sendList, sendLocation, sendMedia, sendText } from "@/modules/whatsapp/service";
import type { InteractiveHeader, ListSection, MediaKind } from "@/modules/whatsapp";
import { analyze, extractEntities } from "@/modules/ai";
import { availableSlots, book } from "@/modules/appointments";
import { findRecords, insertRecord, updateRecords, deleteRecords, incrementRecord, aggregateRecords, type AggregateMetric, type FilterCond } from "@/modules/data";
import { runUserCode } from "./sandbox";
import { ConversationRepository } from "@/modules/whatsapp/repository";
import { getContact } from "@/modules/contacts/service";
import type { Conversation } from "@/modules/whatsapp/models";
import { addTag, removeTag, setCustomField } from "@/modules/contacts/service";
import type { Contact } from "@/modules/contacts/models";
import { sendTemplateMessage } from "@/modules/templates/service";
import { execute as executeAction } from "@/modules/actions/service";
import { respond as aiRespond } from "@/modules/ai/service";
import { escalate } from "@/modules/handoff/service";
import { enqueue } from "@/core/jobs";
import { randomUUID } from "crypto";
import type { Flow, FlowNode, FlowRun } from "./models";
import { FlowRepository, FlowRunRepository, ensureFlowIndexes } from "./repository";

const flows = new FlowRepository();
const runs = new FlowRunRepository();
const conversations = new ConversationRepository();

const MAX_STEPS = 25; // guard against infinite chains / loops (§6.1)

/**
 * Safety net so a conversation never hangs forever (the old engine's #1 bug:
 * a run parked on a waiting node with no reply stayed `waiting` indefinitely).
 * Every input-waiting node arms a no-reply timer; per-node `timeoutMinutes`
 * overrides this default.
 */
const DEFAULT_WAIT_TIMEOUT_MIN = 3;
const DEFAULT_TIMEOUT_FAREWELL =
  "נראה שהשיחה הסתיימה כי לא קיבלתי תשובה 🙂 אפשר לכתוב לי שוב בכל רגע ונמשיך מאיפה שעצרנו.";

/**
 * Global escape hatches: keywords that work from ANY waiting node so a customer
 * is never trapped in a branch (the user reported "אין חזור / אין יציאה").
 * Matched only on plain text (never on a button reply) and only as the whole
 * message, so they don't collide with a legitimate answer that merely contains
 * one of these words.
 */
const ESCAPE_CANCEL = new Set(["ביטול", "בטל", "לבטל", "עצור", "הפסק", "תפסיק", "יציאה", "צא", "cancel", "stop"]);
const ESCAPE_RESTART = new Set(["חזור", "התחל מחדש", "מהתחלה", "התחלה", "איפוס", "אתחל", "restart", "reset"]);
const ESCAPE_AGENT = new Set(["נציג", "אנושי", "בן אדם", "בנאדם", "מוקד", "שירות לקוחות", "אדם אמיתי", "agent", "human"]);
const CANCEL_NOTICE = "ביטלתי את התהליך 🙂 אפשר להתחיל מחדש בכל רגע.";

export interface RunContext {
  conversation: Conversation;
  contact: Contact | null;
  /** The customer's latest input on this turn (for resume / ai nodes). */
  input?: { text?: string; buttonReplyId?: string };
}

// ===========================================================================
// Entry points
// ===========================================================================

/**
 * Find a published flow whose keyword matches the inbound text and start it.
 * Returns the started run, or null if nothing matched.
 */
export async function tryStartByKeyword(
  tenantId: string,
  text: string,
  ctx: RunContext
): Promise<FlowRun | null> {
  await ensureFlowIndexes();
  const t = text.toLowerCase().trim();
  if (!t) return null;

  for (const flow of await flows.listPublished(tenantId)) {
    const keyword = flow.keyword?.toLowerCase().trim();
    if (keyword && t.includes(keyword)) {
      return startFlow(tenantId, flow, ctx);
    }
  }
  return null;
}

export async function startFlow(
  tenantId: string,
  flow: Flow,
  ctx: RunContext
): Promise<FlowRun | null> {
  const start = flow.graph.nodes.find((n) => n.type === "start");
  if (!start) return null;

  // One active run per conversation (§8.1) — never spawn a second concurrent run
  // (e.g. a message trigger + a contact_updated trigger firing on the same turn).
  const active = await runs.findActiveByConversation(tenantId, ctx.conversation.id);
  if (active) return null;

  const run = await runs.create(tenantId, {
    flowId: flow.id,
    flowVersion: flow.version,
    // Snapshot the graph so the run is immune to later edits/publishes (§8.1).
    graph: flow.graph,
    contactId: ctx.contact?.id ?? null,
    conversationId: ctx.conversation.id,
    currentNodeId: start.id,
    state: {},
    status: "running",
    waitUntil: null,
    resumeEvent: null,
  });

  const firstId = nextNodeId(flow, start.id);
  if (firstId) await advance(tenantId, flow, run, firstId, ctx);
  else await finish(tenantId, run);
  return run;
}

/**
 * Resume the active run for a conversation with the customer's input. Returns
 * true if a run consumed the message (so the caller skips other handling).
 */
export async function resumeActive(
  tenantId: string,
  conversationId: string,
  ctx: RunContext
): Promise<boolean> {
  const run = await runs.findActiveByConversation(tenantId, conversationId);
  if (!run || run.status !== "waiting") return false;
  // A timer (delay) wait is resumed by the scheduler, not by an inbound message.
  if (run.resumeEvent === "timer") return false;

  const flow = await loadRunFlow(tenantId, run);
  if (!flow) {
    await runs.update(tenantId, run.id, { status: "stopped" });
    return false;
  }

  const node = getNode(flow, run.currentNodeId);
  if (!node) {
    await finish(tenantId, run);
    return false;
  }

  // Global escape hatches (plain text only) — work from ANY waiting node so the
  // customer is never trapped in a branch ("ביטול" / "חזור" / "נציג").
  if (!ctx.input?.buttonReplyId) {
    const escape = matchEscape(ctx.input?.text);
    if (escape) {
      await handleEscape(tenantId, flow, run, ctx, escape);
      return true;
    }
  }

  // Decide the branch out of the waiting node based on the input.
  let handle: string | undefined;
  const newState = { ...run.state };
  if (node.type === "buttons" || node.type === "list") {
    // The reply must be an interactive id matching one of the node's branches.
    const replyId = ctx.input?.buttonReplyId;
    if (!replyId || !hasExactHandle(flow, node.id, replyId)) {
      // Free text or an unknown id. The old engine silently followed the FIRST
      // branch here (the misroute bug). Instead: take an explicit "invalid" branch
      // if the author drew one, else re-prompt the same node and keep waiting.
      if (hasExactHandle(flow, node.id, "invalid")) {
        await runs.update(tenantId, run.id, { status: "running" });
        await advance(tenantId, flow, run, nextNodeId(flow, node.id, "invalid")!, ctx);
      } else {
        await sendText(tenantId, ctx.conversation.waId, "לא הבנתי 🙂 אפשר לבחור אחת מהאפשרויות שלמעלה.", { sender: "ai" });
        await advance(tenantId, flow, run, node.id, ctx); // re-send the prompt + re-arm the no-reply timer
      }
      return true;
    }
    handle = replyId;
  } else if (node.type === "appointment") {
    // The chosen slot id is the ISO start time → book it now, branch on the result.
    const resourceId = node.data.resourceId as string | undefined;
    const iso = ctx.input?.buttonReplyId;
    if (resourceId && iso) {
      const result = await book(tenantId, {
        resourceId,
        startAt: new Date(iso),
        contactId: run.contactId,
        conversationId: run.conversationId,
      });
      if (result.ok) {
        newState.appointmentStart = iso;
        handle = "success";
      } else {
        handle = "error";
      }
    } else {
      handle = "error";
    }
  } else if (node.type === "question") {
    const field = node.data.field as string | undefined;
    if (field && ctx.input?.text) newState[field] = ctx.input.text;
  } else if (node.type === "wait_reply") {
    const field = node.data.field as string | undefined;
    if (field && ctx.input?.text) newState[field] = ctx.input.text;
    handle = "reply"; // a pending flow.timeout job becomes a no-op once we leave this node
  }

  const next = nextNodeId(flow, node.id, handle);
  await runs.update(tenantId, run.id, { state: newState, status: "running" });
  const fresh = { ...run, state: newState };
  if (next) await advance(tenantId, flow, fresh, next, ctx);
  else await finish(tenantId, fresh);
  return true;
}

// ===========================================================================
// Execution
// ===========================================================================

async function advance(
  tenantId: string,
  flow: Flow,
  run: FlowRun,
  fromNodeId: string,
  ctx: RunContext
): Promise<void> {
  let nodeId: string | null = fromNodeId;
  let steps = 0;

  while (nodeId && steps < MAX_STEPS) {
    steps++;
    const node = getNode(flow, nodeId);
    if (!node) break;

    const result = await executeNode(tenantId, flow, run, node, ctx);
    if (result.wait) {
      await runs.update(tenantId, run.id, {
        currentNodeId: node.id,
        status: "waiting",
        state: run.state,
      });
      // Arm a no-reply timeout for input-waiting nodes (delay is a timer-wait and
      // resumes itself), so a conversation always ends or branches — never hangs.
      if (result.waitKind !== "timer") await armReplyTimeout(tenantId, run, node);
      return;
    }
    if (result.stop) {
      await runs.update(tenantId, run.id, { status: "stopped" });
      return;
    }
    nodeId = result.next;
  }

  await finish(tenantId, run);
}

interface StepResult {
  next: string | null;
  wait?: boolean;
  /** "timer" = scheduler-resumed wait (delay); otherwise an input wait that arms a no-reply timeout. */
  waitKind?: "reply" | "timer";
  stop?: boolean;
}

async function executeNode(
  tenantId: string,
  flow: Flow,
  run: FlowRun,
  node: FlowNode,
  ctx: RunContext
): Promise<StepResult> {
  const to = ctx.conversation.waId;
  const d = node.data;

  switch (node.type) {
    case "message": {
      await sendText(tenantId, to, interpolate(String(d.text ?? ""), run, ctx), { sender: "ai" });
      return { next: nextNodeId(flow, node.id) };
    }

    case "buttons": {
      // Accept both the engine shape ({id,title}) and the builder UI shape ({id,label}).
      const buttons = (d.buttons as Array<{ id: string; title?: string; label?: string }>) ?? [];
      // Optional header (text/media) + footer — the rich-message composer (redesign §6.2A).
      // Back-compat: a node with no header/footer sends exactly as before.
      const h = d.header as { kind?: string; text?: string; link?: string; filename?: string } | undefined;
      let header: InteractiveHeader | undefined;
      if (h?.kind === "text" && h.text) header = { kind: "text", text: interpolate(h.text, run, ctx) };
      else if ((h?.kind === "image" || h?.kind === "video") && h.link) header = { kind: h.kind, link: h.link };
      else if (h?.kind === "document" && h.link) header = { kind: "document", link: h.link, filename: h.filename };
      const footer = typeof d.footer === "string" && d.footer ? interpolate(d.footer, run, ctx) : undefined;
      await sendButtons(tenantId, to, interpolate(String(d.text ?? "בחר אפשרות:"), run, ctx),
        buttons.map((b) => ({ id: b.id, title: b.title ?? b.label ?? "" })), { sender: "ai" },
        header || footer ? { header, footer } : undefined);
      return { next: null, wait: true };
    }

    case "list": {
      const rows = (d.rows as Array<{ id: string; title?: string; label?: string; description?: string }>) ?? [];
      const sections: ListSection[] = [
        {
          title: String(d.sectionTitle ?? ""),
          rows: rows.map((r) => ({
            id: r.id,
            title: (r.title ?? r.label ?? "").slice(0, 24),
            description: r.description ? interpolate(r.description, run, ctx) : undefined,
          })),
        },
      ];
      // A list header is text-only (Cloud API); media headers are split to a preceding node by the composer.
      const lh = d.header as { kind?: string; text?: string } | undefined;
      const listHeader = lh?.kind === "text" && lh.text ? interpolate(lh.text, run, ctx) : undefined;
      const listFooter = typeof d.footer === "string" && d.footer ? interpolate(d.footer, run, ctx) : undefined;
      await sendList(tenantId, to, interpolate(String(d.text ?? "בחר אפשרות:"), run, ctx),
        String(d.buttonLabel ?? "בחר"), sections, { sender: "ai" },
        listHeader || listFooter ? { header: listHeader, footer: listFooter } : undefined);
      return { next: null, wait: true };
    }

    case "question": {
      if (d.text) await sendText(tenantId, to, interpolate(String(d.text), run, ctx), { sender: "ai" });
      return { next: null, wait: true };
    }

    case "wait_reply": {
      if (d.text) await sendText(tenantId, to, interpolate(String(d.text), run, ctx), { sender: "ai" });
      // The no-reply timer is armed centrally in `advance` for every waiting node
      // (a per-node `timeoutMinutes` overrides the default). Inbound resumes this
      // normally; the timer fires the "timeout" branch (or a farewell) only if no
      // reply arrives — see resumeTimedOut.
      return { next: null, wait: true };
    }

    case "condition": {
      const pass = evaluate(d.condition as ConditionExpr, buildContext(run, ctx));
      return { next: nextNodeId(flow, node.id, pass ? "true" : "false") };
    }

    case "switch": {
      const value = readPath(buildContext(run, ctx), String(d.field ?? ""));
      const cases = (d.cases as Array<{ value: string; handle: string }>) ?? [];
      const match = cases.find((c) => String(c.value) === String(value ?? ""));
      const handle = match ? match.handle : "default";
      return { next: nextNodeId(flow, node.id, handle) ?? nextNodeId(flow, node.id, "default") };
    }

    case "split": {
      const branches = (d.branches as Array<{ handle: string; weight: number }>) ?? [];
      const total = branches.reduce((sum, b) => sum + (Number(b.weight) || 0), 0);
      if (total <= 0) return { next: nextNodeId(flow, node.id) };
      let r = Math.random() * total;
      for (const b of branches) {
        r -= Number(b.weight) || 0;
        if (r < 0) return { next: nextNodeId(flow, node.id, b.handle) ?? nextNodeId(flow, node.id) };
      }
      return { next: nextNodeId(flow, node.id, branches[branches.length - 1].handle) ?? nextNodeId(flow, node.id) };
    }

    case "jump_to_node": {
      // Logical jump within the same flow (loops/shortcuts); MAX_STEPS guards runaway loops.
      const target = d.targetNodeId as string | undefined;
      if (target && getNode(flow, target)) return { next: target };
      return { next: nextNodeId(flow, node.id) };
    }

    case "set_field": {
      const field = d.field as string;
      if (field && run.contactId) {
        await setCustomField(tenantId, run.contactId, field, d.value);
      }
      if (field) run.state[field] = d.value;
      return { next: nextNodeId(flow, node.id) };
    }

    case "set_var": {
      const target = d.target as string | undefined;
      if (target) {
        const raw = interpolate(String(d.value ?? ""), run, ctx);
        run.state[target] = applyTransform(raw, typeof d.transform === "string" ? d.transform : "none");
      }
      return { next: nextNodeId(flow, node.id) };
    }

    case "data": {
      // Generic data-collection read/write ([קטגוריה 28]). Branches:
      //   find/get → found | empty ;  insert/update/delete/increment → success | error.
      const op = String(d.op ?? "find");
      const collection = String(d.collection ?? "");
      const outKey = (d.outputKey as string) || "data";
      if (!collection) return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };

      const filter: FilterCond[] = ((d.filter as Array<{ field: string; op: string; value?: unknown }>) ?? [])
        .filter((f) => f.field)
        .map((f) => ({
          field: f.field,
          op: f.op as FilterCond["op"],
          value: typeof f.value === "string" ? interpolate(f.value, run, ctx) : f.value,
        }));
      const values: Record<string, unknown> = {};
      for (const p of ((d.values as Array<{ key: string; value: unknown }>) ?? [])) {
        if (!p.key) continue;
        values[p.key] = typeof p.value === "string" ? interpolate(p.value, run, ctx) : p.value;
      }

      // Reference fields to resolve into the row (relations, §28). Accepts an
      // array or a comma-separated string of field keys.
      const expand = Array.isArray(d.expand)
        ? (d.expand as string[])
        : typeof d.expand === "string" && d.expand.trim()
        ? d.expand.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      try {
        if (op === "find") {
          const rows = await findRecords(tenantId, collection, { filter, expand, limit: Number(d.limit ?? 0) || undefined });
          run.state[outKey] = rows.map((r) => r.data);
          run.state[`${outKey}Count`] = rows.length;
          return { next: nextNodeId(flow, node.id, rows.length ? "found" : "empty") ?? nextNodeId(flow, node.id) };
        }
        if (op === "get") {
          const rows = await findRecords(tenantId, collection, { filter, expand, limit: 1 });
          run.state[outKey] = rows[0]?.data ?? null;
          return { next: nextNodeId(flow, node.id, rows.length ? "found" : "empty") ?? nextNodeId(flow, node.id) };
        }
        if (op === "aggregate") {
          const results = await aggregateRecords(tenantId, collection, {
            filter,
            metric: (String(d.metric ?? "count") as AggregateMetric),
            field: d.field ? String(d.field) : undefined,
            groupBy: d.groupBy ? String(d.groupBy) : undefined,
          });
          run.state[outKey] = results;
          // Convenience: the single total when ungrouped (e.g. {{state.dataValue}}).
          run.state[`${outKey}Value`] = results[0]?.value ?? 0;
          return { next: nextNodeId(flow, node.id, results.length ? "found" : "empty") ?? nextNodeId(flow, node.id) };
        }
        if (op === "insert") {
          const rec = await insertRecord(tenantId, collection, values);
          run.state[outKey] = rec.data;
          return { next: nextNodeId(flow, node.id, "success") ?? nextNodeId(flow, node.id) };
        }
        if (op === "update") {
          const count = await updateRecords(tenantId, collection, filter, values);
          run.state[outKey] = count;
          return { next: nextNodeId(flow, node.id, count > 0 ? "success" : "error") ?? nextNodeId(flow, node.id) };
        }
        if (op === "delete") {
          const count = await deleteRecords(tenantId, collection, filter);
          run.state[outKey] = count;
          return { next: nextNodeId(flow, node.id, "success") ?? nextNodeId(flow, node.id) };
        }
        if (op === "increment") {
          const amount = Number(typeof d.amount === "string" ? interpolate(d.amount, run, ctx) : d.amount) || 0;
          const rec = await incrementRecord(tenantId, collection, filter, String(d.field ?? ""), amount, true);
          run.state[outKey] = rec?.data ?? null;
          return { next: nextNodeId(flow, node.id, rec ? "success" : "error") ?? nextNodeId(flow, node.id) };
        }
        return { next: nextNodeId(flow, node.id) };
      } catch (err) {
        run.state[`${outKey}Error`] = String(err);
        console.warn("[flow] data node failed", err);
        return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };
      }
    }

    case "tag": {
      const tag = d.tag as string;
      if (tag && run.contactId) {
        if (d.op === "remove") await removeTag(tenantId, run.contactId, tag);
        else await addTag(tenantId, run.contactId, tag);
      }
      return { next: nextNodeId(flow, node.id) };
    }

    case "template": {
      await sendTemplateMessage(
        tenantId,
        to,
        String(d.name),
        String(d.language ?? "he"),
        (d.variables as string[]) ?? []
      );
      return { next: nextNodeId(flow, node.id) };
    }

    case "media": {
      const kind = String(d.mediaKind ?? d.kind ?? "document") as MediaKind;
      await sendMedia(
        tenantId,
        to,
        kind,
        {
          id: typeof d.mediaId === "string" ? d.mediaId : undefined,
          link: typeof d.link === "string" ? d.link : undefined,
          caption: typeof d.caption === "string" ? interpolate(d.caption, run, ctx) : undefined,
          filename: typeof d.filename === "string" ? d.filename : undefined,
          mimeType: typeof d.mimeType === "string" ? d.mimeType : undefined,
        },
        { sender: "ai" }
      );
      return { next: nextNodeId(flow, node.id) };
    }

    case "location": {
      await sendLocation(tenantId, to, {
        latitude: Number(d.latitude) || 0,
        longitude: Number(d.longitude) || 0,
        name: typeof d.name === "string" ? d.name : undefined,
        address: typeof d.address === "string" ? d.address : undefined,
      }, { sender: "ai" });
      return { next: nextNodeId(flow, node.id) };
    }

    case "action": {
      const actionId = d.actionId as string | undefined;
      if (actionId) {
        const input = { ...(d.input as Record<string, unknown>), ...run.state };
        const result = await executeAction(tenantId, actionId, input, {
          conversationId: ctx.conversation.id,
        });
        run.state[(d.outputKey as string) ?? "lastAction"] = result.output;
        // Branch on success/failure if the node has those handles (§8.3 error branch).
        const handle = result.status === "success" ? "success" : "error";
        const branched = nextNodeId(flow, node.id, handle);
        return { next: branched ?? nextNodeId(flow, node.id) };
      }
      return { next: nextNodeId(flow, node.id) };
    }

    case "api": {
      const result = await executeApiNode(d, run, ctx);
      run.state[(d.outputKey as string) ?? "lastApi"] = result.body;
      for (const [stateKey, path] of Object.entries((d.responseMapping as Record<string, string>) ?? {})) {
        run.state[stateKey] = readPath(result.body, path);
      }
      const handle = result.ok ? "success" : "error";
      return { next: nextNodeId(flow, node.id, handle) ?? nextNodeId(flow, node.id) };
    }

    case "validate": {
      const value = readPath(buildContext(run, ctx), String(d.field ?? "message.text"));
      const valid = validateValue(value, d);
      return { next: nextNodeId(flow, node.id, valid ? "valid" : "invalid") ?? nextNodeId(flow, node.id) };
    }

    case "ai": {
      await aiRespond(tenantId, ctx.conversation, ctx.contact, ctx.input?.text ?? "");
      return { next: nextNodeId(flow, node.id) };
    }

    case "ai_classify": {
      const nlu = await analyze(ctx.input?.text ?? "");
      run.state[(d.outputKey as string) ?? "intent"] = nlu.intent;
      const cases = (d.cases as Array<{ value: string; handle: string }>) ?? [];
      const match = cases.find((c) => c.value === nlu.intent);
      const handle = match ? match.handle : "default";
      return { next: nextNodeId(flow, node.id, handle) ?? nextNodeId(flow, node.id, "default") };
    }

    case "ai_extract": {
      const fields = (d.fields as Array<{ key: string; description?: string }>) ?? [];
      const source = String(readPath(buildContext(run, ctx), String(d.sourceField ?? "message.text")) ?? "");
      const extracted = await extractEntities(source, fields);
      for (const f of fields) {
        if (!f.key) continue;
        const value = extracted[f.key] ?? null;
        run.state[f.key] = value;
        if (d.writeToContact && run.contactId && value != null) {
          await setCustomField(tenantId, run.contactId, f.key, value);
        }
      }
      return { next: nextNodeId(flow, node.id) };
    }

    case "run_code": {
      const result = await runUserCode(String(d.code ?? ""), { state: run.state, input: ctx.input }, {
        timeoutMs: typeof d.timeoutMs === "number" ? d.timeoutMs : undefined,
      });
      if (result.ok) {
        run.state[(d.outputKey as string) ?? "codeResult"] = result.value ?? null;
        return { next: nextNodeId(flow, node.id, "success") ?? nextNodeId(flow, node.id) };
      }
      run.state["codeError"] = result.error ?? "error";
      console.warn("[flow] run_code failed", result.error);
      return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };
    }

    case "handoff": {
      await escalate(tenantId, ctx.conversation.id, {
        reason: (d.reason as never) ?? "customer_request",
      });
      return { next: nextNodeId(flow, node.id), stop: true };
    }

    case "appointment": {
      const resourceId = d.resourceId as string | undefined;
      if (!resourceId) return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };
      const slots = await availableSlots(tenantId, resourceId, { days: Number(d.days ?? 7) || 7, limit: 10 });
      if (slots.length === 0) {
        if (d.noSlotsText) await sendText(tenantId, to, interpolate(String(d.noSlotsText), run, ctx), { sender: "ai" });
        return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };
      }
      const sections: ListSection[] = [
        {
          title: String(d.sectionTitle ?? "מועדים פנויים").slice(0, 24),
          rows: slots.map((s) => ({ id: s.startAt.toISOString(), title: formatSlot(s.startAt) })),
        },
      ];
      await sendList(tenantId, to, interpolate(String(d.text ?? "בחר מועד פנוי:"), run, ctx),
        String(d.buttonLabel ?? "בחר מועד"), sections, { sender: "ai" });
      return { next: null, wait: true };
    }

    case "delay": {
      const minutes = Number(d.minutes ?? d.delayMinutes ?? 0) || 0;
      const runAt = new Date(Date.now() + minutes * 60 * 1000);
      await runs.update(tenantId, run.id, {
        currentNodeId: node.id,
        status: "waiting",
        waitUntil: runAt,
        resumeEvent: "timer",
        state: run.state,
      });
      await enqueue(tenantId, "flow.resume", { runId: run.id }, runAt);
      return { next: null, wait: true, waitKind: "timer" };
    }

    case "jump": {
      const targetFlowId = d.targetFlowId as string | undefined;
      const target = targetFlowId ? await flows.findById(tenantId, targetFlowId) : null;
      if (target && target.enabled && target.status === "published") {
        // End THIS run before starting the target: startFlow enforces "one active
        // run per conversation" (§8.1), so while this run is still `running` it
        // would block the target from starting. Mark it done first, then hand off.
        await finish(tenantId, run);
        await startFlow(tenantId, target, ctx);
        return { next: null };
      }
      return { next: nextNodeId(flow, node.id, "error") ?? nextNodeId(flow, node.id) };
    }

    case "stop":
      return { next: null, stop: true };

    case "end": {
      if (d.text) await sendText(tenantId, to, interpolate(String(d.text), run, ctx), { sender: "ai" });
      return { next: null };
    }

    default:
      return { next: nextNodeId(flow, node.id) };
  }
}

async function finish(tenantId: string, run: FlowRun): Promise<void> {
  await runs.update(tenantId, run.id, { status: "done" });
}

/**
 * Resume a run parked on a `delay` node — called by the scheduler ([core/jobs])
 * when the timer fires. Advances past the delay to the next node.
 */
export async function resumeScheduledRun(tenantId: string, runId: string): Promise<void> {
  const run = await runs.findById(tenantId, runId);
  if (!run || run.status !== "waiting" || run.resumeEvent !== "timer") return;

  const flow = await loadRunFlow(tenantId, run);
  if (!flow) {
    await runs.update(tenantId, runId, { status: "stopped" });
    return;
  }

  const conversation = await conversations.findById(tenantId, run.conversationId);
  if (!conversation) {
    await runs.update(tenantId, runId, { status: "stopped" });
    return;
  }
  const contact = run.contactId ? await getContact(tenantId, run.contactId) : null;
  const ctx: RunContext = { conversation, contact, input: {} };

  const next = nextNodeId(flow, run.currentNodeId);
  await runs.update(tenantId, runId, { status: "running", resumeEvent: null });
  const fresh = { ...run, status: "running" as const, resumeEvent: null };
  if (next) await advance(tenantId, flow, fresh, next, ctx);
  else await finish(tenantId, fresh);
}

/**
 * Fire the no-reply timeout of ANY input-waiting node — called by the scheduler
 * when the timer elapses. A no-op unless the run is STILL parked on that exact
 * node with the matching `waitToken`: a reply (or re-prompt) that moved the run
 * on, or a finished run, cancels the timeout. When the node has an explicit
 * "timeout" branch it is followed; otherwise the run ends with a farewell so the
 * conversation always closes cleanly instead of hanging forever.
 */
export async function resumeTimedOut(
  tenantId: string,
  runId: string,
  nodeId: string,
  token?: string
): Promise<void> {
  const run = await runs.findById(tenantId, runId);
  if (!run || run.status !== "waiting" || run.currentNodeId !== nodeId) return;
  // A timer-wait (delay) is resumed by resumeScheduledRun, not by a no-reply timeout.
  if (run.resumeEvent === "timer") return;
  // Stale timer: an earlier arming on this node (e.g. a re-prompt) was superseded.
  if (token && run.waitToken && run.waitToken !== token) return;

  const flow = await loadRunFlow(tenantId, run);
  if (!flow) {
    await runs.update(tenantId, runId, { status: "stopped" });
    return;
  }
  const node = getNode(flow, nodeId);
  if (!node) {
    await finish(tenantId, run);
    return;
  }

  const conversation = await conversations.findById(tenantId, run.conversationId);
  if (!conversation) {
    await runs.update(tenantId, runId, { status: "stopped" });
    return;
  }
  const contact = run.contactId ? await getContact(tenantId, run.contactId) : null;
  const ctx: RunContext = { conversation, contact, input: {} };

  await runs.update(tenantId, runId, { status: "running" });
  const fresh = { ...run, status: "running" as const };

  if (hasExactHandle(flow, nodeId, "timeout")) {
    await advance(tenantId, flow, fresh, nextNodeId(flow, nodeId, "timeout")!, ctx);
    return;
  }
  const farewell =
    typeof node.data.timeoutText === "string" && node.data.timeoutText
      ? node.data.timeoutText
      : DEFAULT_TIMEOUT_FAREWELL;
  if (farewell) await sendText(tenantId, conversation.waId, interpolate(farewell, fresh, ctx), { sender: "ai" });
  await finish(tenantId, fresh);
}

// ===========================================================================
// Helpers
// ===========================================================================

function getNode(flow: Flow, id: string): FlowNode | undefined {
  return flow.graph.nodes.find((n) => n.id === id);
}

/**
 * The flow a run should execute. Prefers the immutable snapshot captured at start
 * (§8.1 version-lock) so edits to the live flow never disrupt in-flight runs;
 * falls back to the live flow for legacy runs created before snapshots existed.
 */
async function loadRunFlow(tenantId: string, run: FlowRun): Promise<Flow | null> {
  if (run.graph) {
    return {
      id: run.flowId,
      tenantId,
      name: "",
      version: run.flowVersion,
      status: "published",
      graph: run.graph,
      keyword: null,
      enabled: true,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
  return flows.findById(tenantId, run.flowId);
}

/** The target of the edge leaving `nodeId`, preferring a matching `handle`. */
function nextNodeId(flow: Flow, nodeId: string, handle?: string): string | null {
  const edges = flow.graph.edges.filter((e) => e.source === nodeId);
  if (handle) {
    const match = edges.find((e) => e.sourceHandle === handle);
    if (match) return match.target;
  }
  const fallback = edges.find(
    (e) => !e.sourceHandle || e.sourceHandle === "default" || e.sourceHandle === "output"
  );
  return (fallback ?? edges[0])?.target ?? null;
}

/** True if the node has an edge whose branch key is exactly `handle`. */
function hasExactHandle(flow: Flow, nodeId: string, handle: string): boolean {
  return flow.graph.edges.some((e) => e.source === nodeId && e.sourceHandle === handle);
}

/**
 * Arm the no-reply timer for a run parked on an input-waiting node. A fresh token
 * is stored on the run and carried in the job, so any earlier timer for this run
 * (e.g. from a re-prompt on the same node) becomes a no-op when it fires. Honors a
 * per-node `timeoutMinutes`, falling back to DEFAULT_WAIT_TIMEOUT_MIN.
 */
async function armReplyTimeout(tenantId: string, run: FlowRun, node: FlowNode): Promise<void> {
  const override = Number(node.data.timeoutMinutes);
  const minutes = override > 0 ? override : DEFAULT_WAIT_TIMEOUT_MIN;
  if (minutes <= 0) return;
  const token = randomUUID();
  await runs.update(tenantId, run.id, { waitToken: token });
  run.waitToken = token;
  const runAt = new Date(Date.now() + minutes * 60 * 1000);
  await enqueue(tenantId, "flow.timeout", { runId: run.id, nodeId: node.id, token }, runAt);
}

type EscapeKind = "cancel" | "restart" | "agent";

/** Match a whole-message global escape keyword (case-insensitive). */
function matchEscape(text?: string): EscapeKind | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (ESCAPE_CANCEL.has(t)) return "cancel";
  if (ESCAPE_RESTART.has(t)) return "restart";
  if (ESCAPE_AGENT.has(t)) return "agent";
  return null;
}

/** Apply a global escape: cancel/end, restart-from-start, or hand off to a human. */
async function handleEscape(
  tenantId: string,
  flow: Flow,
  run: FlowRun,
  ctx: RunContext,
  kind: EscapeKind
): Promise<void> {
  if (kind === "cancel") {
    await sendText(tenantId, ctx.conversation.waId, CANCEL_NOTICE, { sender: "ai" });
    await finish(tenantId, run);
    return;
  }
  if (kind === "restart") {
    // End this run, then re-run the same (snapshotted) flow from its start node.
    await finish(tenantId, run);
    await startFlow(tenantId, flow, ctx);
    return;
  }
  // agent → escalate to a human. This intentionally mutes the AI (§14); a
  // stale mute self-heals only if auto-handback is configured (see Roadmap).
  await finish(tenantId, run);
  await escalate(tenantId, ctx.conversation.id, { reason: "customer_request" });
}

function buildContext(run: FlowRun, ctx: RunContext): EvaluationContext {
  return {
    contact: (ctx.contact as unknown as Record<string, unknown>) ?? null,
    conversation: ctx.conversation as unknown as Record<string, unknown>,
    message: { text: ctx.input?.text ?? "", buttonReplyId: ctx.input?.buttonReplyId ?? null },
    now: new Date(),
    state: run.state,
  };
}

/** Replace {{state.x}} / {{contact.firstName}} tokens in a node's text. */
function interpolate(text: string, run: FlowRun, ctx: RunContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const [root, key] = path.split(".");
    if (root === "state" && key) return String(run.state[key] ?? "");
    if (root === "contact" && key && ctx.contact) {
      return String((ctx.contact as unknown as Record<string, unknown>)[key] ?? "");
    }
    return "";
  });
}

export { FlowRepository, FlowRunRepository, ensureFlowIndexes };

async function executeApiNode(
  data: Record<string, unknown>,
  run: FlowRun,
  ctx: RunContext
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = interpolate(String(data.url ?? ""), run, ctx);
  if (!url) throw new Error("api node missing url");
  const method = String(data.method ?? "GET").toUpperCase();
  const headers = mapInterpolated(data.headers, run, ctx);
  const rawBody = data.body == null ? undefined : JSON.stringify(applyTemplate(data.body, run, ctx));
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" || method === "HEAD" ? undefined : rawBody,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

function mapInterpolated(value: unknown, run: FlowRun, ctx: RunContext): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(String(v), run, ctx)])
  );
}

function applyTemplate(value: unknown, run: FlowRun, ctx: RunContext): unknown {
  if (typeof value === "string") return interpolate(value, run, ctx);
  if (Array.isArray(value)) return value.map((v) => applyTemplate(v, run, ctx));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyTemplate(v, run, ctx)]));
  }
  return value;
}

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

/** Compact Hebrew label for an appointment slot, ≤24 chars (WhatsApp list-row limit). */
function formatSlot(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .slice(0, 24);
}

/** Transform a value for the `set_var` node (§8.2 Set variable / Formula). */
function applyTransform(value: string, transform: string): unknown {
  switch (transform) {
    case "uppercase": return value.toUpperCase();
    case "lowercase": return value.toLowerCase();
    case "trim": return value.trim();
    case "number": { const n = Number(value); return Number.isNaN(n) ? value : n; }
    case "date_now": return new Date().toISOString();
    default: return value;
  }
}

function validateValue(value: unknown, data: Record<string, unknown>): boolean {
  if (data.required && (value == null || value === "")) return false;
  const text = String(value ?? "");
  if (typeof data.regex === "string" && data.regex) {
    try {
      if (!new RegExp(data.regex).test(text)) return false;
    } catch {
      return false;
    }
  }
  if (typeof data.minLength === "number" && text.length < data.minLength) return false;
  if (typeof data.maxLength === "number" && text.length > data.maxLength) return false;
  return true;
}
