/**
 * PATCH/DELETE /api/wre/clients/:id/listings/:listingId — human correction of a
 * captured listing.
 *
 * Actions:
 *   pin      — drop/drag the pin manually. This is the escape hatch for every
 *              address the geocoder could not resolve, and it wins permanently:
 *              `manualPin` blocks any later re-geocode from moving it.
 *   address  — fix the extracted address, then re-run the geocoder on it.
 *   status   — accept / reject a listing.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/core/http";
import { getListing, updateListing, deleteListing } from "@/modules/wre/repository";
import { geocodeAddress } from "@/modules/wre/geo";
import { dedupKey } from "@/modules/wre/geo/normalize";
import { inIsrael } from "@/modules/wre/geo/provider";
import { audit } from "@/modules/wa-engine/auditLog";
import type { ListingStatus } from "@/modules/wre/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; listingId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, listingId } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  const listing = await getListing(id, listingId);
  if (!listing) return NextResponse.json({ error: "דירה לא נמצאה" }, { status: 404 });

  if (action === "pin") {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "קואורדינטות לא תקינות" }, { status: 400 });
    }
    if (!inIsrael(lat, lng)) {
      return NextResponse.json({ error: "הנקודה מחוץ לישראל" }, { status: 400 });
    }
    const updated = await updateListing(id, listingId, {
      lat,
      lng,
      manualPin: true,
      status: "mapped",
      reviewReason: null,
      // A human dragged the pin to an exact spot, so the "house number is a
      // placeholder" caveat no longer applies regardless of what's in the field.
      houseNumberApprox: false,
      // A human placed this pin, so provider score/match no longer describe it.
      geocodeScore: null,
      geocodeMatch: null,
      geocodeProvider: "manual",
      geocodedAt: new Date(),
    });
    await audit(undefined, ip, "wre.listing.pin", listingId, { lat, lng });
    return NextResponse.json({ ok: true, listing: updated });
  }

  if (action === "address") {
    const city = String(body.city ?? listing.city).trim();
    const street = String(body.street ?? listing.street).trim();
    const houseNumber = String(body.houseNumber ?? listing.houseNumber).trim();

    const geo = await geocodeAddress(city, street, houseNumber);
    const updated = await updateListing(id, listingId, {
      city,
      street,
      // A broker who resubmits without giving a real number is treated the
      // same as one who typed "1" on purpose — a human reviewed this via
      // "Fix Address" either way, same as `manualPin` trusting a dragged pin.
      houseNumber: geo.houseNumberApprox ? "1" : houseNumber,
      lat: geo.lat,
      lng: geo.lng,
      geocodeScore: geo.score,
      geocodeMatch: geo.matchedText,
      geocodeProvider: geo.provider,
      geocodedAt: geo.provider ? new Date() : null,
      manualPin: false,
      reviewReason: geo.reviewReason,
      houseNumberApprox: geo.houseNumberApprox,
      status: geo.reviewReason ? "needs_review" : "mapped",
      dedupKey: dedupKey(city, street, houseNumber, listing.rooms),
    });
    await audit(undefined, ip, "wre.listing.address", listingId, { city, street, houseNumber });
    return NextResponse.json({ ok: true, listing: updated });
  }

  if (action === "status") {
    const status = body.status as ListingStatus;
    if (!(["mapped", "needs_review", "rejected", "duplicate"] as ListingStatus[]).includes(status)) {
      return NextResponse.json({ error: "status לא תקין" }, { status: 400 });
    }
    const updated = await updateListing(id, listingId, { status });
    await audit(undefined, ip, "wre.listing.status", listingId, { status });
    return NextResponse.json({ ok: true, listing: updated });
  }

  return NextResponse.json({ error: "action לא תקין" }, { status: 400 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(req, "wre.manage");
  if (auth instanceof NextResponse) return auth;
  const { id, listingId } = await ctx.params;
  const ok = await deleteListing(id, listingId);
  if (!ok) return NextResponse.json({ error: "דירה לא נמצאה" }, { status: 404 });
  await audit(undefined, req.headers.get("x-forwarded-for") ?? undefined, "wre.listing.delete", listingId);
  return NextResponse.json({ ok: true });
}

// The shared fetch client (src/lib/wtmbtb/api.ts) exposes PUT but not PATCH.
export const PUT = PATCH;
