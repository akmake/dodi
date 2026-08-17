/**
 * Filesystem locations for the WhatsApp engine (WTM + BTB) — [איחוד Whatsapp↔bootWhat].
 *
 * Ported from `Whatsapp/server`, where every service resolved paths relative to
 * its own file via `import.meta.url`. Under Next.js `next start` the process
 * always runs from the project root, so `process.cwd()` is the reliable anchor
 * instead (module-relative resolution is not guaranteed once webpack bundles
 * this code for the server build).
 *
 * IMPORTANT (migration): these directories must be seeded from the legacy
 * `Whatsapp/server/{sessions,media,logs}` folders before cutover — see the plan's
 * "no live session loss" principle. Nothing here creates them automatically at
 * import time (only lazily, on first use), to avoid surprising directory
 * creation during `tsc`/build.
 */
import path from "path";

const ROOT = path.join(process.cwd(), "var", "wa-engine");

export const WA_ENGINE_DIR = ROOT;
export const SESSIONS_DIR = path.join(ROOT, "sessions");
export const WTM_MEDIA_DIR = path.join(ROOT, "wtm-media");
export const LOGS_DIR = path.join(ROOT, "logs");
export const LOG_FILE = path.join(LOGS_DIR, "app.log");
