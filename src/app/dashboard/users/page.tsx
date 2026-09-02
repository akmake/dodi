"use client";

/**
 * Team & roles ([קטגוריה 25]) — users + RBAC role assignment. Live /api/users.
 */
import { useCallback, useEffect, useState } from "react";
import { Users, Plus, AlertCircle, Loader2 } from "lucide-react";

interface User {
  id: string;
  email: string;
  name: string | null;
  status: string;
  roleId: string;
}

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleName, setRoleName] = useState("agent");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setItems(j.items ?? []);
      setRoles(j.roles ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!email.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, roleName }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setEmail(""); setName("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>צוות והרשאות</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>משתמשים ותפקידי RBAC</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>הזמנת משתמש</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם (לא חובה)"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <select value={roleName} onChange={(e) => setRoleName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {(roles.length ? roles : ["agent"]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={add} disabled={saving || !email.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            הזמן
          </button>
        </div>

        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Users size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין משתמשים עדיין</p>
            </div>
          ) : (
            items.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex items-center gap-2">
                  <Users size={15} style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{u.name || u.email}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: u.status === "active" ? "var(--accent-light)" : "var(--bg-base)", color: u.status === "active" ? "var(--accent-dark)" : "var(--text-muted)" }}>{u.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
