/**
 * WTA schedule engine — a once-a-minute tick that enforces `admin_only_schedule`
 * rules: lock a group to "admins only" (announcement mode) during the rule's
 * window and reopen it outside the window.
 *
 * Idempotency: we remember the last state we applied per (client, group) and
 * only call WhatsApp when the desired state actually changes. On first
 * observation we enforce a *lock* if the window is currently active, but never
 * force an unlock at startup — so a manual lock is never clobbered on boot.
 */
import { listWtaClients, listEnabledRules, recordAction } from "./repository";
import { setGroupAnnounce, isConnected } from "@/modules/wa-engine/whatsappManager";
import { broadcast } from "@/modules/wa-engine/sseManager";
import { logger } from "@/modules/wa-engine/logger";
import { nowInTz, inTimeWindow } from "./rules";
import { waId } from "./manager";
import type { AdminOnlyScheduleRule } from "./models";

let loopRunning = false;

// (clientId:groupId) -> last locked state we applied. undefined = never seen.
const lastState = new Map<string, boolean>();

export function startScheduler(): void {
  if (loopRunning) return;
  loopRunning = true;
  setInterval(() => void tick(), 60_000);
  void tick();
  console.log("[wta] scheduler הופעל (טיק-דקה)");
}

/** Is the lock window currently active for this rule (in Asia/Jerusalem)? */
function windowActive(rule: AdminOnlyScheduleRule): boolean {
  const { minutes, day } = nowInTz();
  if (rule.days?.length && !rule.days.includes(day)) return false;
  return inTimeWindow(minutes, rule.lockAt, rule.unlockAt);
}

async function applyGroup(clientId: string, groupId: string, groupName: string, ruleId: string, desiredLocked: boolean) {
  const key = `${clientId}:${groupId}`;
  const prev = lastState.get(key);

  // First observation: enforce a lock if needed, but don't force-unlock on boot.
  if (prev === undefined) {
    if (!desiredLocked) {
      lastState.set(key, false);
      return;
    }
  } else if (prev === desiredLocked) {
    return; // no change
  }

  try {
    await setGroupAnnounce(waId(clientId), `${groupId}@g.us`, desiredLocked);
    lastState.set(key, desiredLocked);
    await recordAction({
      clientId,
      type: desiredLocked ? "lock" : "unlock",
      ruleId,
      groupJid: groupId,
      groupName,
      actorPhone: "",
      actorName: "",
      reason: "לפי לוח זמנים",
      textSnippet: "",
    }).catch(() => {});
    broadcast("wta");
    console.log(`[wta] ${desiredLocked ? "🔒 נעל" : "🔓 פתח"} ${groupName} (${clientId})`);
  } catch (err) {
    logger.warn("wta", `schedule ${desiredLocked ? "lock" : "unlock"} failed: ${err instanceof Error ? err.message : String(err)}`, { clientId, groupId });
  }
}

async function tick(): Promise<void> {
  try {
    const clients = (await listWtaClients()).filter((c) => c.active);
    for (const client of clients) {
      const clientId = client._id.toString();
      if (!isConnected(clientId)) continue;

      const rules = (await listEnabledRules(clientId)).filter((r): r is AdminOnlyScheduleRule => r.type === "admin_only_schedule");
      if (rules.length === 0) continue;

      const enabledGroups = client.managedGroups.filter((g) => g.enabled);

      for (const rule of rules) {
        const desired = windowActive(rule);
        const scoped = rule.groupIds?.length
          ? enabledGroups.filter((g) => rule.groupIds!.some((rg) => rg.replace(/:\d+$/, "") === g.groupId.replace(/:\d+$/, "")))
          : enabledGroups;
        for (const g of scoped) {
          await applyGroup(clientId, g.groupId.replace(/:\d+$/, ""), g.groupName, rule._id.toString(), desired);
        }
      }
    }
  } catch (err) {
    logger.error("wta", `scheduler tick error: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined });
  }
}
