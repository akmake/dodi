/**
 * WTA bootstrap — connects every active client's always-on socket and starts
 * the schedule engine. Called once from the wa-engine bootstrap route on server
 * boot (alongside `startWtm` / `startBtb`).
 */
import { ensureWtaIndexes, listWtaClients } from "./repository";
import { connect } from "./manager";
import { startScheduler } from "./scheduler";
import { logger } from "@/modules/wa-engine/logger";

let started = false;

export async function startWta(): Promise<void> {
  if (started) return;
  started = true;

  await ensureWtaIndexes();

  const clients = await listWtaClients();
  const active = clients.filter((c) => c.active);
  logger.info("server", `loading ${active.length} WTA clients (always-on)`);
  console.log(`[wta] טוען ${active.length} לקוחות (always-on)...`);
  for (const client of active) {
    void connect(client._id.toString());
  }

  startScheduler();
}
