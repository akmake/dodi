/**
 * WTM media retention — port of `Whatsapp/server/services/mediaCleanup.js`,
 * verbatim 26h cutoff (this bridge only needs same-day media on disk).
 */
import fs from "fs";
import path from "path";
import { WTM_MEDIA_DIR } from "@/modules/wa-engine/paths";

const MAX_AGE_MS = 26 * 60 * 60 * 1000;

const run = () => {
  if (!fs.existsSync(WTM_MEDIA_DIR)) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  let deleted = 0;
  try {
    for (const tenantDir of fs.readdirSync(WTM_MEDIA_DIR)) {
      const tenantPath = path.join(WTM_MEDIA_DIR, tenantDir);
      if (!fs.statSync(tenantPath).isDirectory()) continue;
      for (const file of fs.readdirSync(tenantPath)) {
        const filePath = path.join(tenantPath, file);
        try {
          if (fs.statSync(filePath).mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        } catch {
          // ok
        }
      }
    }
    if (deleted > 0) console.log(`[media-cleanup] נמחקו ${deleted} קבצים ישנים`);
  } catch (err) {
    console.error("[media-cleanup] שגיאה:", err instanceof Error ? err.message : err);
  }
};

export const startMediaCleanup = (): void => {
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref?.();
  console.log("[media-cleanup] פעיל — מנקה קבצי מדיה מעל 26 שעות");
};
