"use client";
/**
 * Public invite acceptance ([איחוד]). The invitee picks their OWN email +
 * password; the account is created here and they're taken to their area.
 * No session required to view this page.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const SERVICE_LABEL: Record<string, string> = { wtm: "WTM", btb: "BTB", wbr: "WBR", wta: "WTA" };

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) || "";

  const [meta, setMeta] = useState<{ state: string; name?: string | null; isAdmin?: boolean; allowedServices?: string[] } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`, { cache: "no-store" })
      .then(async (r) => setMeta(await r.json()))
      .catch(() => setMeta({ state: "error" }));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("הסיסמה חייבת לפחות 8 תווים");
    if (password !== confirm) return setError("הסיסמאות אינן תואמות");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "ההרשמה נכשלה");
      // Account created + logged in → straight to their allowed area.
      router.push(j.autoLogin ? "/services" : "/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const invalid = meta && meta.state !== "ok";
  const stateMsg: Record<string, string> = {
    not_found: "קישור ההזמנה לא נמצא.",
    used: "ההזמנה כבר נוצלה. אם כבר יש לך חשבון — היכנס/י בדף ההתחברות.",
    expired: "תוקף ההזמנה פג. בקש/י מהמנהל קישור חדש.",
    error: "אירעה שגיאה בטעינת ההזמנה.",
  };

  return (
    <div className="wtmbtb-scope min-h-screen flex items-center justify-center px-4 bg-gray-50" dir="rtl" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 text-white" style={{ background: "linear-gradient(135deg,#563554,#4a2c48)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" /></svg>
          </div>
          <h1 className="font-bold text-lg text-[#111b21]">הצטרפות ל-bootWhat</h1>
          {meta?.state === "ok" && (
            <p className="text-xs text-gray-500 mt-1 text-center">
              {meta.name ? `${meta.name} · ` : ""}
              {meta.isAdmin ? "מנהל" : (meta.allowedServices ?? []).map((s) => SERVICE_LABEL[s] ?? s).join(" · ")}
            </p>
          )}
        </div>

        {!meta ? (
          <p className="text-sm text-gray-400 text-center">טוען…</p>
        ) : invalid ? (
          <div className="text-sm text-center text-gray-600">
            <p>{stateMsg[meta.state] ?? "ההזמנה אינה תקפה."}</p>
            <button onClick={() => router.push("/login")} className="mt-4 text-xs text-[#563554] underline">לדף ההתחברות</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-gray-500">בחר/י אימייל וסיסמה לחשבון שלך.</p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="האימייל שלך" dir="ltr"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#563554]/20" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה (לפחות 8 תווים)" dir="ltr"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#563554]/20" />
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="אימות סיסמה" dir="ltr"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#563554]/20" />
            {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#563554" }}>
              {submitting ? "יוצר חשבון…" : "יצירת חשבון וכניסה"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
