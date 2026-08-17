/**
 * WRE connection manager — one ALWAYS-ON Baileys socket per client, namespaced
 * `wre_<clientId>` so it never clashes with WTM (bare id), BTB (`btb_<id>`) or
 * WTA (`wta_<id>`).
 *
 * Rides the shared `wa-engine/whatsappManager`, like WTA's manager. It does NOT
 * join WTM's conveyor pool: a sleeping socket never sees a group message, and a
 * missed message is a listing the broker never learns about.
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
import { handleWreMessage } from "./listener";

/** wa-engine instance id for a WRE client. */
export const waId = (clientId: string) => `wre_${clientId}`;

/** Reverse of {@link waId} — strips the namespace back to the WreClient._id. */
export const clientIdFromWaId = (id: string) => id.replace(/^wre_/, "");

/**
 * Force-(re)start the socket. Tears down any existing one that isn't already
 * connected. For explicit user intent only — bootstrap, the "reconnect" button,
 * re-activating a client.
 */
export const connect = (clientId: string) => startTenant(waId(clientId), handleWreMessage);

/** Sockets whose `startTenant` is mid-flight — see {@link ensureStarted}. */
const starting = new Set<string>();

/**
 * Start the socket only if it isn't already up or on its way up.
 *
 * `startTenant` is NOT idempotent, despite what the call sites elsewhere claim:
 * it returns early only when the instance is `connected` (or reconnect-locked),
 * and otherwise **destroys the existing socket and builds a new one**. During
 * pairing the status is `waiting_qr` — so calling `connect` again mid-pairing
 * kills the very socket that issued the QR and mints a fresh code. To a user
 * that looks like a QR that changes every couple of seconds and can never be
 * scanned, because the code on screen is dead the moment it renders.
 *
 * Anything that polls (i.e. the QR modal) MUST use this, never `connect`.
 *
 * The `starting` set closes the race in `startTenant` itself: it awaits
 * `useMultiFileAuthState`/`fetchLatestBaileysVersion` *before* registering the
 * instance, so for a beat there is no instance and the status still reads
 * "disconnected" — without this guard a second poll inside that window would
 * start a competing socket.
 */
export const ensureStarted = async (clientId: string): Promise<void> => {
  const id = waId(clientId);
  if (starting.has(id)) return;

  const status = waGetStatus(id);
  if (status === "connected" || status === "connecting" || status === "waiting_qr") return;

  starting.add(id);
  try {
    // `stopTenant` first, to drop the instance before restarting.
    //
    // This is what keeps pairing alive. startTenant inherits the failure count
    // (`reconnectAttempts: existing?.reconnectAttempts ?? 0`), and the engine
    // treats an unscanned QR window — which closes with a perfectly normal
    // `408` — as a failed reconnect. So every window the user doesn't scan in
    // time doubles the backoff (3s → … → the 5min cap) and burns one of the 15
    // attempts, after which the engine gives up on the client for good. A user
    // who simply took a while to find their phone would watch pairing get
    // slower and then die.
    //
    // Backoff is the right policy for an established socket that dropped; it is
    // the wrong policy for "nobody has scanned yet". Clearing the instance
    // resets the count to zero, so an open QR modal always gets a fresh code
    // within seconds instead of waiting out a backoff it did nothing to earn.
    stopTenant(id);
    await startTenant(id, handleWreMessage);
  } finally {
    starting.delete(id);
  }
};

export const disconnect = (clientId: string) => stopTenant(waId(clientId));

export const reset = (clientId: string) => resetSession(waId(clientId));

export const getStatus = (clientId: string) => waGetStatus(waId(clientId));
export const getQR = (clientId: string) => waGetQR(waId(clientId));
export const isConnected = (clientId: string) => waIsConnected(waId(clientId));

/** Groups the bot's number currently participates in (requires a live connection). */
export const listGroups = (clientId: string) => fetchGroups(waId(clientId));

/** Live status map for just the WRE instances (for the monitor view). */
export const getWreStatuses = (): Record<string, string> => {
  const all = getAllStatuses();
  const result: Record<string, string> = {};
  for (const [id, status] of Object.entries(all)) {
    if (id.startsWith("wre_")) result[clientIdFromWaId(id)] = status;
  }
  return result;
};
