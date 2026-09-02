/**
 * WTM bootstrap — replaces what `Whatsapp/server/index.js`'s `start()` did for
 * the WTM half: load active clients into the pool and start the conveyor.
 * Called once from `src/instrumentation.ts` on server boot.
 */
import { listWtmClients } from "./repository";
import { poolAdd, startConveyor } from "./tenantPool";
import { registerQueueSend } from "./emailBridgeManager";
import { poolQueueSend } from "./tenantPool";
import { startMediaCleanup } from "./mediaCleanup";
import { logger } from "@/modules/wa-engine/logger";

let started = false;

export async function startWtm(): Promise<void> {
  if (started) return;
  started = true;

  registerQueueSend(poolQueueSend);
  startMediaCleanup();

  const clients = await listWtmClients();
  const active = clients.filter((c) => c.active);
  logger.info("server", `loading ${active.length} WTM clients into pool`);
  console.log(`[wtm] טוען ${active.length} לקוחות לפול...`);
  for (const client of active) {
    poolAdd(client._id.toString(), client);
  }
  startConveyor();
}
