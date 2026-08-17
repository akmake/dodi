"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error === "invalid credentials" ? "אימייל או סיסמה שגויים" : j.error ?? "התחברות נכשלה");
      }
      // Land on the service switcher — it shows only the areas this user may enter.
      router.push("/services");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg-base)" }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", boxShadow: "0 4px 24px rgba(0,0,0,.06)" }}
      >
        <div className="flex flex-col items-center mb-7">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
            </svg>
          </div>
          <h1 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            התחברות ל-bootWhat
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            היכנס/י עם האימייל והסיסמה שלך
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="אימייל" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="סיסמה" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

          {error && (
            <div className="text-xs rounded-lg px-3 py-2" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {loading ? "רגע…" : "התחברות"}
          </button>
        </form>

        <p className="w-full text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
          אין לך חשבון? פנה/י למנהל המערכת לקבלת קישור הזמנה.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "current-password" : "email"}
        className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
      />
    </label>
  );
}
