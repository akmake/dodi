/**
 * POST /api/wa-engine/bootstrap — starts the WRE (real-estate) Baileys engine:
 * the always-on sockets, plus the SSE keep-alive. Called once by
 * `src/instrumentation.ts` on server boot, via `fetch()` rather than a direct
 * import — a route handler is always single-runtime, so this keeps
 * Baileys/ffmpeg-installer out of the edge-runtime webpack build entirely,
 * which a direct import from `instrumentation.ts` cannot guarantee.
 *
 * Guarded by `x-cron-secret` (when CRON_SECRET is set), and idempotent —
 * each start*() call is itself guarded against double-start.
 */
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/core/config";
import { startWre } from "@/modules/wre/service";
import { startSseKeepAlive } from "@/modules/wa-engine/sseManager";
import { ensureSystemRoles } from "@/modules/admin/service";
import { defaultTenantId } from "@/core/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (config.cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== config.cronSecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Keep the system roles' scopes in sync with rbac.ts on every boot, so
    // existing owner/admin/manager accounts get wre scopes without re-onboarding.
    await ensureSystemRoles(defaultTenantId()).catch((err) =>
      console.warn("[wa-engine] role sync skipped:", err instanceof Error ? err.message : err)
    );
    startSseKeepAlive();
    await startWre();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[wa-engine] bootstrap failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
