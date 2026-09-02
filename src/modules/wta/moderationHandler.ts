/**
 * WTA inbound handler — the `onMessage` every WTA socket runs for each incoming
 * message. It filters to enabled managed groups, optionally logs the message,
 * then enforces the client's keyword/link moderation rules (delete / warn /
 * kick), recording each action to `wta_actions`.
 *
 * Time-based rules (`admin_only_schedule`) are handled by `scheduler.ts`, not
 * here.
 */
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { resolveContact, getMessageText } from "@/modules/wa-engine/whatsappManager";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { logger } from "@/modules/wa-engine/logger";
import { getWtaClient, listEnabledRules, recordAction, logMessage } from "./repository";
import type { KeywordDeleteRule, LinkDeleteRule, OnMatchAction } from "./models";
import { matchKeyword, matchLink, ruleAppliesToGroup, scheduleActive, type Violation } from "./rules";

const clientIdFromWaId = (id: string) => id.replace(/^wta_/, "");

// ─── group metadata cache (name + admin set), 5 min TTL ──────────────────────
interface GroupMeta {
  name: string;
  adminJids: Set<string>;
  adminPhones: Set<string>;
  ts: number;
}
const metaCache = new Map<string, GroupMeta>();
const META_TTL = 5 * 60 * 1000;

const digitsOf = (jid: string) => (jid || "").replace(/[:@].*$/, "").replace(/\D/g, "");

async function getGroupMeta(sock: WASocket, groupJid: string): Promise<GroupMeta> {
  const cached = metaCache.get(groupJid);
  if (cached && Date.now() - cached.ts < META_TTL) return cached;
  try {
    const meta = await sock.groupMetadata(groupJid);
    const adminJids = new Set<string>();
    const adminPhones = new Set<string>();
    for (const p of meta.participants ?? []) {
      if (p.admin === "admin" || p.admin === "superadmin") {
        if (p.id) {
          adminJids.add(p.id.replace(/:\d+@/, "@"));
          const d = digitsOf(p.id);
          if (d) adminPhones.add(d);
        }
      }
    }
    const fresh = { name: meta.subject || groupJid.replace("@g.us", ""), adminJids, adminPhones, ts: Date.now() };
    metaCache.set(groupJid, fresh);
    return fresh;
  } catch {
    const fallback = { name: groupJid.replace("@g.us", ""), adminJids: new Set<string>(), adminPhones: new Set<string>(), ts: Date.now() };
    return fallback;
  }
}

/** Evaluate keyword + link rules; return the first violation or null. */
function firstViolation(
  rules: Array<KeywordDeleteRule | LinkDeleteRule>,
  groupId: string,
  text: string
): Violation | null {
  for (const rule of rules) {
    if (!ruleAppliesToGroup(rule.groupIds, groupId)) continue;
    if (!scheduleActive(rule.schedule)) continue;
    const reason = rule.type === "keyword_delete" ? matchKeyword(rule, text) : matchLink(rule, text);
    if (reason) {
      return { ruleId: rule._id.toString(), ruleName: rule.name, action: rule.onMatch, reason, warnText: rule.warnText };
    }
  }
  return null;
}

export const handleWtaMessage = async (waTenantId: string, msg: WAMessage, sock: WASocket): Promise<void> => {
  const clientId = clientIdFromWaId(waTenantId);
  const client = await getWtaClient(clientId);
  if (!client || !client.active) return;

  const remoteJid = msg.key.remoteJid || "";
  if (!remoteJid.endsWith("@g.us")) return; // groups only

  const groupId = remoteJid.replace("@g.us", "").replace(/:\d+$/, "");
  const managed = client.managedGroups.find((g) => g.groupId.replace(/:\d+$/, "") === groupId);
  if (!managed || !managed.enabled) return;

  const senderJid = (msg.key.participant || (msg as unknown as { participant?: string }).participant || "").replace(/:\d+@/, "@");
  const contact = resolveContact(waTenantId, senderJid);
  const fromPhone = contact.phone || digitsOf(senderJid) || "unknown";
  const senderName = contact.name || msg.pushName || contact.pushName || fromPhone;
  const text = getMessageText(msg);

  const meta = await getGroupMeta(sock, remoteJid);

  if (client.logMessages) {
    await logMessage({
      clientId,
      groupJid: groupId,
      groupName: meta.name,
      phone: fromPhone,
      senderName,
      text,
      msgId: msg.key.id || null,
    }).catch(() => {});
  }

  if (!text) return; // keyword/link rules operate on text

  const rules = (await listEnabledRules(clientId)).filter(
    (r): r is KeywordDeleteRule | LinkDeleteRule => r.type === "keyword_delete" || r.type === "link_delete"
  );
  if (rules.length === 0) return;

  const violation = firstViolation(rules, groupId, text);
  if (!violation) return;

  // Admin exemption — best-effort match on jid or resolved phone.
  const senderIsAdmin = meta.adminJids.has(senderJid) || (fromPhone !== "unknown" && meta.adminPhones.has(fromPhone));
  if (client.exemptAdmins && senderIsAdmin) return;

  await enforce(waTenantId, sock, remoteJid, msg, violation, {
    clientId,
    groupId,
    groupName: meta.name,
    actorPhone: fromPhone,
    actorName: senderName,
    senderJid,
    text,
  });
};

interface EnforceCtx {
  clientId: string;
  groupId: string;
  groupName: string;
  actorPhone: string;
  actorName: string;
  senderJid: string;
  text: string;
}

async function enforce(
  waTenantId: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  v: Violation,
  ctx: EnforceCtx
): Promise<void> {
  const record = (type: "delete" | "warn" | "kick") =>
    recordAction({
      clientId: ctx.clientId,
      type,
      ruleId: v.ruleId,
      groupJid: ctx.groupId,
      groupName: ctx.groupName,
      actorPhone: ctx.actorPhone,
      actorName: ctx.actorName,
      reason: v.reason,
      textSnippet: ctx.text.slice(0, 200),
    }).catch(() => {});

  // 1) Always delete the offending message (delete-for-everyone; needs bot admin).
  try {
    await sock.sendMessage(remoteJid, { delete: msg.key as never });
    await record("delete");
  } catch (err) {
    logger.warn("wta", `delete failed (bot not admin?): ${err instanceof Error ? err.message : String(err)}`, {
      clientId: ctx.clientId,
      groupId: ctx.groupId,
    });
    // If we can't delete, warn/kick almost certainly fail too — stop here.
    broadcast("wta");
    return;
  }

  // 2) Escalation.
  const escalate: OnMatchAction = v.action;
  if ((escalate === "warn" || escalate === "kick") && v.warnText) {
    try {
      await sock.sendMessage(remoteJid, { text: v.warnText });
      await record("warn");
    } catch {
      // best-effort
    }
  }
  if (escalate === "kick" && ctx.senderJid) {
    try {
      await sock.groupParticipantsUpdate(remoteJid, [ctx.senderJid], "remove");
      await record("kick");
    } catch (err) {
      logger.warn("wta", `kick failed: ${err instanceof Error ? err.message : String(err)}`, { clientId: ctx.clientId, groupId: ctx.groupId });
    }
  }

  broadcast("wta");
}
