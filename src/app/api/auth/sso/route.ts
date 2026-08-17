/**
 * SSO (OIDC) configuration for the tenant ([קטגוריה 25] §25.3 / SSO).
 *   GET  → the config (secret omitted).
 *   POST → upsert { issuer, clientId, clientSecret, autoProvision?, defaultRole?, enabled? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getSsoConfig, setSsoConfig } from "@/modules/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const cfg = await getSsoConfig(auth.tenantId);
  if (!cfg) return NextResponse.json({ config: null });
  // Never return the encrypted secret to the client.
  const { clientSecretEncrypted: _omit, ...safe } = cfg;
  void _omit;
  return NextResponse.json({ config: { ...safe, hasSecret: true } });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "settings.manage");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    autoProvision?: boolean;
    defaultRole?: string;
    enabled?: boolean;
  };
  if (!body.issuer || !body.clientId || !body.clientSecret) {
    return NextResponse.json({ error: "issuer, clientId and clientSecret are required" }, { status: 400 });
  }
  const cfg = await setSsoConfig(auth.tenantId, {
    issuer: body.issuer,
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    autoProvision: body.autoProvision,
    defaultRole: body.defaultRole,
    enabled: body.enabled,
  });
  const { clientSecretEncrypted: _omit, ...safe } = cfg;
  void _omit;
  return NextResponse.json({ config: { ...safe, hasSecret: true } });
}
