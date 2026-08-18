/**
 * Server bootstrap hook (Next.js `instrumentation`).
 *
 * On a long-lived Node process (`next start` / `next dev`) this fires once to
 * start the WRE Baileys engine, by hitting our own `/api/wa-engine/bootstrap`
 * route via fetch() rather than a direct import — a route handler is always
 * single-runtime, so this keeps Baileys/ffmpeg-installer out of the
 * edge-runtime webpack build entirely (see that route for the full reason).
 */
import { config } from "@/core/config";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const port = process.env.PORT || "3000";

  // Let the server bind the port first, then boot the WRE engine once.
  setTimeout(() => {
    fetch(`http://127.0.0.1:${port}/api/wa-engine/bootstrap`, {
      method: "POST",
      headers: config.cronSecret ? { "x-cron-secret": config.cronSecret } : {},
    }).catch((err) => console.warn("[wa-engine] bootstrap call failed:", err instanceof Error ? err.message : err));
  }, 10_000);
}
