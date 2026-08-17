/**
 * WRE bootstrap — connects every active client's always-on socket. Called once
 * from the wa-engine bootstrap route on server boot (alongside `startWtm` /
 * `startBtb` / `startWta`).
 */
import { ensureWreIndexes, listWreClients } from "./repository";
import { connect } from "./manager";
import { logger } from "@/modules/wa-engine/logger";

let started = false;

export async function startWre(): Promise<void> {
  if (started) return;
  started = true;

  await ensureWreIndexes();

  const clients = await listWreClients();
  const active = clients.filter((c) => c.active);
  logger.info("server", `loading ${active.length} WRE clients (always-on)`);
  console.log(`[wre] טוען ${active.length} לקוחות (always-on)...`);
  for (const client of active) {
    void connect(client._id.toString());
  }
}
