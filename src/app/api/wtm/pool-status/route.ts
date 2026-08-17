import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getPoolStatus } from "@/modules/wtm/tenantPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "wtm.manage");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(getPoolStatus());
}
