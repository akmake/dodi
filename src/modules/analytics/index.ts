/**
 * Analytics / Reporting — [קטגוריה 23].
 *
 * MVP computes KPIs by aggregating the operational collections on read (no
 * separate event store yet — that's the §23.1 upgrade). All counts are
 * tenant-scoped. Feeds the analytics dashboard.
 */
import { getDb } from "@/core/db/mongo";

export * from "./events";
export * from "./reports";

export interface Overview {
  contacts: number;
  conversations: { total: number; open: number };
  messages: { inbound: number; outbound: number; aiSent: number };
  ai: { handoffs: number; openHandoffs: number; deflectionRate: number | null };
  tickets: { open: number; total: number };
  campaignsSent: number;
}

export async function getOverview(tenantId: string): Promise<Overview> {
  const db = await getDb();
  const scope = { tenantId };

  const [
    contacts,
    conversationsTotal,
    conversationsOpen,
    inbound,
    outbound,
    aiSent,
    handoffs,
    openHandoffs,
    ticketsTotal,
    ticketsOpen,
    campaignRecipientsSent,
  ] = await Promise.all([
    db.collection("contacts").countDocuments(scope),
    db.collection("wa_conversations").countDocuments(scope),
    db.collection("wa_conversations").countDocuments({ ...scope, status: { $in: ["open", "pending"] } }),
    db.collection("wa_messages").countDocuments({ ...scope, direction: "inbound" }),
    db.collection("wa_messages").countDocuments({ ...scope, direction: "outbound" }),
    db.collection("wa_messages").countDocuments({ ...scope, sender: "ai" }),
    db.collection("handoffs").countDocuments(scope),
    db.collection("handoffs").countDocuments({ ...scope, resolvedAt: null }),
    db.collection("tickets").countDocuments(scope),
    db.collection("tickets").countDocuments({ ...scope, status: { $nin: ["solved", "closed"] } }),
    db.collection("campaign_recipients").countDocuments({ ...scope, status: "sent" }),
  ]);

  // Deflection ≈ share of conversations the AI handled without escalating.
  const deflectionRate =
    conversationsTotal > 0
      ? Math.max(0, Math.min(1, (conversationsTotal - handoffs) / conversationsTotal))
      : null;

  return {
    contacts,
    conversations: { total: conversationsTotal, open: conversationsOpen },
    messages: { inbound, outbound, aiSent },
    ai: { handoffs, openHandoffs, deflectionRate },
    tickets: { open: ticketsOpen, total: ticketsTotal },
    campaignsSent: campaignRecipientsSent,
  };
}
