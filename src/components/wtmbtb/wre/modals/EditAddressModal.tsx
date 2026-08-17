"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Modal from "@/components/wtmbtb/ui/Modal";
import Field from "@/components/wtmbtb/ui/Field";
import { wreApi, ApiError } from "@/lib/wtmbtb/api";

const REVIEW_LABEL: Record<string, string> = {
  no_address: "ההודעה לא מציינת רחוב",
  no_city: "ההודעה לא מציינת עיר",
  no_house_number: "אין מספר בית — הסיכה תהיה משוערת על הרחוב",
  geocode_miss: "הכתובת לא נמצאה במאגר",
  low_score: "ההתאמה חלשה — כדאי לאמת",
  geocode_error: "הגיאוקודינג נכשל",
};

/**
 * Correct a listing's address and re-run the geocoder.
 *
 * The message text is shown alongside the fields on purpose: the address is
 * almost always *in* the post, and the reason a row lands here is that the
 * extractor read it wrong or the post was vague. Making the broker reopen the
 * message elsewhere to copy an address across is what makes a tool feel cheap.
 */
export default function EditAddressModal({
  clientId,
  listing,
  onClose,
  onSaved,
}: {
  clientId: string;
  listing: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [city, setCity] = useState(listing.city ?? "");
  const [street, setStreet] = useState(listing.street ?? "");
  const [houseNumber, setHouseNumber] = useState(listing.houseNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await wreApi.put<any>(`/clients/${clientId}/listings/${listing._id}`, {
        action: "address",
        city: city.trim(),
        street: street.trim(),
        houseNumber: houseNumber.trim(),
      });
      // Show what the geocoder actually decided, rather than closing blind — the
      // whole point of this screen is to see whether the fix landed.
      setResult(res.data.listing);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.response.data.error || "השמירה נכשלה" : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const mapped = result?.status === "mapped";

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div dir="rtl">
        <h3 className="text-lg font-bold mb-1 text-[#111b21]">תיקון כתובת</h3>
        <p className="text-sm text-[#8696a0] mb-4">
          {listing.reviewReason ? REVIEW_LABEL[listing.reviewReason] ?? "דרוש אימות" : "עדכן את הכתובת והמערכת תמפה מחדש"}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* The source, so the address never has to be hunted in another screen. */}
          <div className="order-2 sm:order-1">
            <p className="text-xs font-medium text-slate-600 mb-1.5">ההודעה המקורית</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
              {listing.rawText}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {listing.groupName} · {listing.senderName}
            </p>
          </div>

          <form onSubmit={save} className="order-1 sm:order-2 space-y-3">
            <Field label="עיר">
              <input className="input-base" value={city} onChange={(e) => setCity(e.target.value)} placeholder="קרית אתא" required />
            </Field>
            <Field label="רחוב">
              <input className="input-base" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="השומר" required />
            </Field>
            <Field label="מספר בית" hint="בלי מספר — הסיכה תהיה משוערת על הרחוב, וניתן יהיה לגרור אותה">
              <input className="input-base" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="11" />
            </Field>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {result && (
              <div className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${mapped ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                {mapped ? (
                  <>
                    <strong>נמצא במפה ✓</strong>
                    <br />
                    התאמה: {result.geocodeMatch}
                  </>
                ) : (
                  <>
                    <strong>עדיין דרוש אימות</strong>
                    <br />
                    {REVIEW_LABEL[result.reviewReason] ?? "לא אומת"}
                    {result.geocodeMatch && (
                      <>
                        <br />
                        הכי קרוב שנמצא: {result.geocodeMatch}
                      </>
                    )}
                    {result.lat && <><br />הסיכה הוצבה — אפשר לגרור אותה במפה למקום המדויק.</>}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 transition text-sm">
                {saving ? "ממפה..." : result ? "מפה שוב" : "שמור ומפה"}
              </button>
              <button type="button" onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-200 transition text-sm">
                {result ? "סגור" : "ביטול"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
