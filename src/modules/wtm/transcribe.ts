/**
 * Thin client for the Whisper transcription worker thread — port of
 * `Whatsapp/server/services/transcribe.js`. The actual worker script is
 * `scripts/transcribeWorker.mjs` (see that file for why it's outside `src/`).
 */
import { Worker } from "worker_threads";
import path from "path";

const WORKER_PATH = path.join(process.cwd(), "scripts", "transcribeWorker.mjs");

let _worker: Worker | null = null;
let _seq = 0;
const pending = new Map<number, { resolve: (text: string | null) => void }>();

const rejectAll = () => {
  for (const [, { resolve }] of pending) resolve(null); // fail gracefully — returns null
  pending.clear();
};

function getWorker(): Worker {
  if (_worker) return _worker;

  console.log("[Whisper] מפעיל worker thread לתמלול...");
  _worker = new Worker(WORKER_PATH);

  _worker.on("message", ({ id, text, error }: { id: number; text?: string; error?: string }) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) {
      console.error("[Whisper] transcription failed:", error);
      entry.resolve(null);
    } else {
      entry.resolve(text ?? null);
    }
  });

  _worker.on("error", (err) => {
    console.error("[Whisper] worker error:", err.message);
    rejectAll();
    _worker = null; // recreated on next job
  });

  _worker.on("exit", (code) => {
    if (code !== 0) console.error(`[Whisper] worker יצא עם קוד ${code}`);
    rejectAll();
    _worker = null;
  });

  return _worker;
}

export const transcribeAudio = (filePath: string): Promise<string | null> =>
  new Promise((resolve) => {
    const id = ++_seq;
    pending.set(id, { resolve });
    try {
      getWorker().postMessage({ id, filePath });
    } catch (err) {
      pending.delete(id);
      console.error("[Whisper] לא ניתן לשלוח עבודה ל-worker:", err instanceof Error ? err.message : err);
      resolve(null);
    }
  });
