/**
 * WTA connection manager — one ALWAYS-ON Baileys socket per client, namespaced
 * `wta_<clientId>` so it never clashes with WTM (bare id) or BTB (`btb_<id>`).
 *
 * Rides the shared `wa-engine/whatsappManager`, exactly like BTB's
 * `statusManager`. Unlike WTM it does NOT join the conveyor pool: a moderation
 * bot must observe every group message live to be able to delete it, so the
 * socket stays online.
 */
import {
  startTenant,
  stopTenant,
  resetSession,
  getStatus as waGetStatus,
  getQR as waGetQR,
  isConnected as waIsConnected,
  getAllStatuses,
  fetchGroups,
} from "@/modules/wa-engine/whatsappManager";
import { handleWtaMessage } from "./moderationHandler";

/** wa-engine instance id for a WTA client. */
export const waId = (clientId: string) => `wta_${clientId}`;

/** Reverse of {@link waId} — strips the namespace back to the WtaClient._id. */
export const clientIdFromWaId = (id: string) => id.replace(/^wta_/, "");

export const connect = (clientId: string) => startTenant(waId(clientId), handleWtaMessage);

export const disconnect = (clientId: string) => stopTenant(waId(clientId));

export const reset = (clientId: string) => resetSession(waId(clientId));

export const getStatus = (clientId: string) => waGetStatus(waId(clientId));
export const getQR = (clientId: string) => waGetQR(waId(clientId));
export const isConnected = (clientId: string) => waIsConnected(waId(clientId));

/** Groups the bot's number currently participates in (requires a live connection). */
export const listGroups = (clientId: string) => fetchGroups(waId(clientId));

/** Live status map for just the WTA instances (for the monitor / pool-status view). */
export const getWtaStatuses = (): Record<string, string> => {
  const all = getAllStatuses();
  const result: Record<string, string> = {};
  for (const [id, status] of Object.entries(all)) {
    if (id.startsWith("wta_")) result[clientIdFromWaId(id)] = status;
  }
  return result;
};
