/**
 * WTM conveyor pool — port of `Whatsapp/server/services/tenantPool.js`,
 * verbatim behavior. Baileys sockets are expensive, so only `POOL_MAX_ACTIVE`
 * clients are ever connected at once; the rest cycle sleep→wake on a conveyor.
 */
import { startTenant, sleepTenant, waitForConnected } from "@/modules/wa-engine/whatsappManager";
import { startBridge, stopBridge } from "./emailBridgeManager";
import { handleIncomingWAMessage } from "./bridgeHandler";
import { logger } from "@/modules/wa-engine/logger";
import type { WtmClient } from "./models";

const MAX_ACTIVE = parseInt(process.env.WTM_POOL_MAX_ACTIVE ?? "20");
const SYNC_WINDOW = parseInt(process.env.WTM_POOL_SYNC_WINDOW_MS ?? "15000");

interface PoolEntry {
  client: WtmClient;
  state: "sleeping" | "waking" | "active";
  pendingSends: Array<() => Promise<void>>;
}

const pool = new Map<string, PoolEntry>();
const prioritySet = new Set<string>();

let conveyorPos = 0;
let loopRunning = false;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const activeCount = () => [...pool.values()].filter((e) => e.state !== "sleeping").length;

const flushPending = async (tenantId: string) => {
  const entry = pool.get(tenantId);
  if (!entry) return;
  while (entry.pendingSends.length) {
    const fn = entry.pendingSends.shift();
    try {
      await fn?.();
    } catch (e) {
      console.error(`[pool] שגיאת שליחה ${tenantId}:`, e instanceof Error ? e.message : e);
    }
  }
};

const runCycle = async (tenantId: string) => {
  const entry = pool.get(tenantId);
  if (!entry || entry.state !== "sleeping") return;

  entry.state = "waking";
  console.log(`[pool] ▲ מעיר ${tenantId}`);

  try {
    await startTenant(tenantId, handleIncomingWAMessage);
    const connected = await waitForConnected(tenantId, 30_000);
    if (connected) {
      entry.state = "active";
      await flushPending(tenantId);
    } else {
      console.warn(`[pool] ${tenantId} לא התחבר תוך 30ש׳ — מדלג`);
    }
    await wait(SYNC_WINDOW);
  } catch (err) {
    console.error(`[pool] שגיאה ${tenantId}:`, err instanceof Error ? err.message : err);
    logger.error("pool", `cycle error: ${err instanceof Error ? err.message : String(err)}`, {
      tenantId,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    if (pool.has(tenantId)) {
      entry.state = "sleeping";
      sleepTenant(tenantId);
      console.log(`[pool] ▼ נרדם ${tenantId}`);
    }
  }
};

export const poolAdd = (tenantId: string, client: WtmClient) => {
  if (pool.has(tenantId)) {
    pool.get(tenantId)!.client = client;
    return;
  }
  pool.set(tenantId, { client, state: "sleeping", pendingSends: [] });
  void startBridge(tenantId, client);
  console.log(`[pool] + ${tenantId} (סה"כ: ${pool.size})`);
};

export const poolRemove = (tenantId: string) => {
  sleepTenant(tenantId);
  stopBridge(tenantId);
  pool.delete(tenantId);
  prioritySet.delete(tenantId);
  console.log(`[pool] - ${tenantId} (סה"כ: ${pool.size})`);
};

export const poolUpdateTenant = (tenantId: string, updated: WtmClient) => {
  const entry = pool.get(tenantId);
  if (entry) entry.client = updated;
};

export const poolQueueSend = (tenantId: string, sendFn: () => Promise<void>) => {
  const entry = pool.get(tenantId);
  if (!entry) return;
  entry.pendingSends.push(sendFn);
  if (entry.state === "active") {
    void flushPending(tenantId);
  } else {
    prioritySet.add(tenantId);
  }
};

// Force wake — admin clicked reconnect / QR.
export const poolForceWake = (tenantId: string) => {
  prioritySet.add(tenantId);
};

export const getPoolStatus = () => ({
  total: pool.size,
  active: [...pool.values()].filter((e) => e.state === "active").length,
  waking: [...pool.values()].filter((e) => e.state === "waking").length,
  sleeping: [...pool.values()].filter((e) => e.state === "sleeping").length,
  maxActive: MAX_ACTIVE,
  syncWindowMs: SYNC_WINDOW,
});

export const startConveyor = () => {
  if (loopRunning) return;
  loopRunning = true;
  void _loop();
  console.log(`[pool] קונבייר הופעל — max=${MAX_ACTIVE}, sync=${SYNC_WINDOW}ms`);
};

const _loop = async () => {
  while (loopRunning) {
    try {
      for (const id of [...prioritySet]) {
        if (activeCount() >= MAX_ACTIVE) break;
        const e = pool.get(id);
        if (!e) {
          prioritySet.delete(id);
          continue;
        }
        if (e.state === "sleeping") {
          prioritySet.delete(id);
          void runCycle(id); // fire and forget
        } else {
          prioritySet.delete(id); // already awake, flush will handle it
        }
      }

      const ids = [...pool.keys()];
      if (ids.length > 0) {
        let checked = 0;
        while (activeCount() < MAX_ACTIVE && checked < ids.length) {
          if (conveyorPos >= ids.length) conveyorPos = 0;
          const id = ids[conveyorPos++];
          checked++;
          const e = pool.get(id);
          if (e?.state === "sleeping" && !prioritySet.has(id)) {
            void runCycle(id); // fire and forget
          }
        }
      }
    } catch (err) {
      console.error("[pool] שגיאה בלולאת קונבייר:", err instanceof Error ? err.message : err);
      logger.error("pool", `conveyor loop error: ${err instanceof Error ? err.message : String(err)}`, {
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    await wait(200);
  }
};
