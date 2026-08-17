/**
 * POST /api/wa-engine/bootstrap — starts the WTM/BTB engine (conveyor pool,
 * BTB connections, health monitor, SSE keep-alive). Called once by
 * `src/instrumentation.ts` on server boot, via `fetch()` rather than a direct
 * import — same reason the jobs self-drain does this (see instrumentation.ts):
 * a route handler is always single-runtime, so this keeps Baileys/mailparser/
 * ffmpeg-installer out of the edge-runtime webpack build entirely, which a
 * direct import from `instrumentation.ts` cannot guarantee (dynamic imports
 * are still resolved as code-split entry points for BOTH runtime builds, even
 * behind a `NEXT_RUNTIME !== "nodejs"` guard).
 *
 * Guarded by the same `x-cron-secret` used for `/api/jobs/drain`, and
 * idempotent (each start*() call is itself guarded against double-start).
 */
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/core/config";
import { startWtm } from "@/modules/wtm/service";
import { startBtb } from "@/modules/btb/service";
import { startWta } from "@/modules/wta/service";
import { startWre } from "@/modules/wre/service";
import { startSms } from "@/modules/sms";
import { startHealthMonitor } from "@/modules/wa-engine/healthMonitor";
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
    // Keep the system roles' scopes in sync with rbac.ts on every boot — this is
    // what grants existing owner/admin/manager accounts the new wtm.manage /
    // btb.manage scopes without anyone having to re-run onboarding (the fix for
    // the 403 on the WTM/BTB screens after the unification).
    await ensureSystemRoles(defaultTenantId()).catch((err) =>
      console.warn("[wa-engine] role sync skipped:", err instanceof Error ? err.message : err)
    );
    startHealthMonitor();
    startSseKeepAlive();
    await startWtm();
    await startBtb();
    await startWta();
    await startWre();
    await startSms();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[wa-engine] bootstrap failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
