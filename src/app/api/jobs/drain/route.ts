/**
 * POST /api/jobs/drain — run due scheduled jobs (C1).
 *
 * Called by a cron (e.g. Vercel Cron) with the `x-cron-secret` header. Claims
 * due jobs and dispatches each to its module. Idempotent + retry-safe: a failed
 * job is rescheduled with backoff by the queue.
 */
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/core/config";
import { defaultTenantId } from "@/core/tenant/context";
import { claimDue, markDone, markFailed, ensureJobIndexes, type Job } from "@/core/jobs";
import { resumeScheduledRun, resumeTimedOut } from "@/modules/flows";
import { send as sendCampaign, sendBatch as sendCampaignBatch } from "@/modules/campaigns";
import { refreshSegment } from "@/modules/segments";
import { runFollowup as runLeadFollowup } from "@/modules/leads";
import { retrySmsDelivery } from "@/modules/sms";
import { deliver as deliverWebhook } from "@/modules/integrations";
import { sweepSlaBreaches } from "@/modules/tickets";
import { runScheduledReports } from "@/modules/analytics";
import { processQueuedInbound, processQueuedWebhook } from "@/modules/pipeline/whatsapp-webhook";
import { logError } from "@/core/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept either our `x-cron-secret` header or Vercel Cron's `Authorization: Bearer`. */
function authorized(req: NextRequest): boolean {
  if (!config.cronSecret) return false;
  return (
    req.headers.get("x-cron-secret") === config.cronSecret ||
    req.headers.get("authorization") === `Bearer ${config.cronSecret}`
  );
}

// Vercel Cron issues GET requests — delegate to the same handler.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureJobIndexes();
  const jobs = await claimDue(50);
  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await dispatch(job);
      await markDone(job.id);
      done++;
    } catch (err) {
      await markFailed(job.id, job.attempts, String(err));
      // A job that exhausts its retries is dead-lettered — flag that louder than
      // a transient retry so a permanently-stuck job (e.g. flow timeout) surfaces.
      const exhausted = job.attempts >= 5;
      logError(
        job.tenantId,
        "drain",
        exhausted ? `משימה נכשלה סופית: ${job.type}` : `כשל בריצת משימה: ${job.type}`,
        err,
        { jobId: job.id, type: job.type, attempts: job.attempts }
      );
      failed++;
    }
  }

  // Periodic maintenance piggy-backed on the drain cron: flag overdue ticket SLAs
  // and emit any due scheduled analytics reports.
  const tenantId = defaultTenantId();
  let slaBreached = 0;
  let reportsRun = 0;
  try {
    slaBreached = await sweepSlaBreaches(tenantId);
  } catch (err) {
    logError(tenantId, "drain", "כשל בסריקת חריגות SLA", err);
  }
  try {
    reportsRun = await runScheduledReports(tenantId);
  } catch (err) {
    logError(tenantId, "drain", "כשל בהרצת דוחות מתוזמנים", err);
  }

  return NextResponse.json({ claimed: jobs.length, done, failed, slaBreached, reportsRun });
}

async function dispatch(job: Job): Promise<void> {
  switch (job.type) {
    case "whatsapp.webhook":
      return processQueuedWebhook(job.payload.payload);
    case "whatsapp.inbound":
      return processQueuedInbound(job.payload.summary);
    case "flow.resume":
      return resumeScheduledRun(job.tenantId, String(job.payload.runId));
    case "flow.timeout":
      return resumeTimedOut(
        job.tenantId,
        String(job.payload.runId),
        String(job.payload.nodeId),
        job.payload.token ? String(job.payload.token) : undefined
      );
    case "campaign.send":
      await sendCampaign(job.tenantId, String(job.payload.campaignId));
      return;
    case "campaign.send_batch":
      await sendCampaignBatch(job.tenantId, String(job.payload.campaignId), Number(job.payload.offset ?? 0));
      return;
    case "segment.refresh":
      await refreshSegment(job.tenantId, String(job.payload.segmentId));
      return;
    case "lead.followup":
      await runLeadFollowup(job.tenantId, String(job.payload.leadId));
      return;
    case "sms.deliver":
      await retrySmsDelivery(job.tenantId, String(job.payload.deliveryId));
      return;
    case "webhook.deliver":
      await deliverWebhook(job.tenantId, String(job.payload.deliveryId));
      return;
    default:
      return;
  }
}
