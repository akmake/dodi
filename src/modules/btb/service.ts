/**
 * BTB bootstrap — replaces the BTB half of `Whatsapp/server/index.js`'s
 * `start()`: connect every active BTB account (outside the WTM pool, stays
 * online). Called once from `src/instrumentation.ts` on server boot.
 */
import { listBtbAccounts } from "./repository";
import { connect } from "./statusManager";
import { logger } from "@/modules/wa-engine/logger";

let started = false;

export async function startBtb(): Promise<void> {
  if (started) return;
  started = true;

  const accounts = await listBtbAccounts();
  const active = accounts.filter((a) => a.active);
  logger.info("server", `connecting ${active.length} BTB accounts`);
  console.log(`[btb] מחבר ${active.length} חשבונות BTB...`);
  for (const acc of active) {
    connect(acc._id.toString()).catch((err) => {
      logger.error("btb", `connect failed: ${err instanceof Error ? err.message : String(err)}`, { accountId: acc._id.toString() });
    });
  }
}
