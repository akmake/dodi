/**
 * Server bootstrap hook (Next.js `instrumentation`).
 *
 * The bot runs as a long-lived PM2 process (`next start`), NOT on Vercel — so the
 * cron in `vercel.json` never fires. Without something hitting `/api/jobs/drain`
 * the job queue is never processed, which means flow no-reply timeouts, `delay`
 * nodes, scheduled campaigns and lead follow-ups would all hang forever.
 *
 * Here we self-drain on an interval by calling our own drain endpoint with the
 * cron secret. Idempotent + atomic claiming (core/jobs) make this safe even if an
 * external cron also drains. No-op on the edge runtime, when disabled
 * (`JOBS_DRAIN_INTERVAL_MS=0`), or when CRON_SECRET is unset.
 */
import { config } from "@/core/config";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const port = process.env.PORT || "3000";

  // ─── WTM/BTB engine bootstrap (Whatsapp↔bootWhat unification) ───────────
  // Hits our own `/api/wa-engine/bootstrap` once, exactly like the jobs
  // self-drain below hits `/api/jobs/drain` — a route handler is always
  // single-runtime, so this is what keeps Baileys/mailparser/ffmpeg-installer
  // out of the edge-runtime webpack build (a direct import here does NOT:
  // dynamic imports are still resolved as code-split entry points for BOTH
  // runtime builds, even behind a `NEXT_RUNTIME !== "nodejs"` guard — see
  // `src/app/api/wa-engine/bootstrap/route.ts` for the full explanation).
  setTimeout(() => {
    fetch(`http://127.0.0.1:${port}/api/wa-engine/bootstrap`, {
      method: "POST",
      headers: config.cronSecret ? { "x-cron-secret": config.cronSecret } : {},
    }).catch((err) => console.warn("[wa-engine] bootstrap call failed:", err instanceof Error ? err.message : err));
  }, 10_000);

  const interval = config.jobs.drainIntervalMs;
  if (!interval || interval <= 0) return;
  if (!config.cronSecret) {
    console.warn("[jobs] self-drain disabled — CRON_SECRET is not set");
    return;
  }

  const url = `http://127.0.0.1:${port}/api/jobs/drain`;

  let inFlight = false;
  const tick = async (): Promise<void> => {
    if (inFlight) return; // never overlap drains
    inFlight = true;
    try {
      await fetch(url, { method: "POST", headers: { "x-cron-secret": config.cronSecret } });
    } catch {
      // Transient (server still binding the port on the first tick, etc.).
    } finally {
      inFlight = false;
    }
  };

  // Let `next start` bind the port before the first drain, then run on the interval.
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), interval);
  }, 10_000);

  console.log(`[jobs] self-drain armed: every ${interval}ms → ${url}`);
}
