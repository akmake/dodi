"use client";
/**
 * Platform admin — create/manage users via invites, assign per-user services
 * (WTM/BTB/WBR), and scope BTB access to specific accounts. Live /api/admin/*.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Shield, Copy, Check, Trash2, UserPlus, Link2, Ban, RotateCcw } from "lucide-react";

type ServiceId = "wtm" | "btb" | "wbr" | "wta" | "wre";
const SERVICE_LABEL: Record<ServiceId, string> = { wtm: "WTM", btb: "BTB", wbr: "WBR", wta: "WTA", wre: "WRE" };
const ALL_SERVICES: ServiceId[] = ["wtm", "btb", "wbr", "wta", "wre"];

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  isAdmin: boolean;
  allowedServices: ServiceId[];
  btbAccountIds: string[];
}
interface BtbAccountOpt {
  id: string;
  name: string;
  phone: string;
}
interface PendingInvite {
  token: string;
  name: string | null;
  isAdmin: boolean;
  allowedServices: ServiceId[];
  btbAccountIds: string[];
  expiresAt: string;
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      title={url}
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {copied ? "הועתק" : "העתק קישור"}
    </button>
  );
}

export default function AdminUsersPage() {
  const [data, setData] = useState<{ users: AdminUser[]; btbAccounts: BtbAccountOpt[]; invites: PendingInvite[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create-invite form
  const [name, setName] = useState("");
  const [services, setServices] = useState<ServiceId[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [btbIds, setBtbIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleService = (s: ServiceId) => setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleBtb = (id: string) => setBtbIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function createInvite() {
    if (creating) return;
    if (!isAdmin && services.length === 0) {
      setError("בחר לפחות שירות אחד או סמן מנהל");
      return;
    }
    setCreating(true);
    setError(null);
    setNewLink(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isAdmin, allowedServices: services, btbAccountIds: services.includes("btb") ? btbIds : [] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setNewLink(`${window.location.origin}/invite/${j.token}`);
      setName("");
      setServices([]);
      setIsAdmin(false);
      setBtbIds([]);
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(u: AdminUser, status: "active" | "disabled") {
    await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  async function removeUser(u: AdminUser) {
    if (!confirm(`למחוק את ${u.email}?`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    load();
  }
  async function revokeInvite(token: string) {
    await fetch(`/api/admin/invites/${token}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: "#563554" }}>
          <Shield size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#111b21]">ניהול משתמשים</h1>
          <p className="text-sm text-gray-500">צור משתמשים, הקצה שירותים, ונהל גישה.</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      {/* Create invite */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={18} className="text-[#563554]" />
          <h2 className="font-bold text-[#111b21]">משתמש חדש (הזמנה)</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">שם / תווית</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: חב״ד כפר יונה"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#563554]/20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">שירותים מותרים</label>
            <div className="flex gap-2">
              {ALL_SERVICES.map((s) => {
                const on = services.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${on ? "border-[#563554] bg-[#563554] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {SERVICE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* BTB account scoping */}
        {services.includes("btb") && data && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              חשבונות BTB מותרים <span className="text-gray-400">(ריק = כל החשבונות / צוות פנימי)</span>
            </label>
            {data.btbAccounts.length === 0 ? (
              <p className="text-xs text-gray-400">אין חשבונות BTB עדיין.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.btbAccounts.map((a) => {
                  const on = btbIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => toggleBtb(a.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-[#3B82F6] bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {a.name} <span dir="ltr" className="text-gray-400">· {a.phone}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            מנהל — גישה מלאה + יכול לנהל משתמשים
          </label>
          <button onClick={createInvite} disabled={creating}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#563554" }}>
            {creating ? "יוצר…" : "צור קישור הזמנה"}
          </button>
        </div>

        {newLink && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 mb-1">
              <Link2 size={16} /> קישור ההזמנה נוצר — שלח אותו למשתמש
            </div>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 truncate rounded-lg bg-white border border-emerald-200 px-3 py-2 text-xs text-gray-700">{newLink}</code>
              <button onClick={() => navigator.clipboard.writeText(newLink)}
                className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-700">העתק</button>
            </div>
          </div>
        )}
      </section>

      {/* Pending invites */}
      {data && data.invites.length > 0 && (
        <section>
          <h2 className="font-bold text-[#111b21] mb-3">הזמנות ממתינות ({data.invites.length})</h2>
          <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
            {data.invites.map((inv) => (
              <div key={inv.token} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111b21]">{inv.name || "(ללא שם)"}</p>
                  <p className="text-xs text-gray-400">
                    {inv.isAdmin ? "מנהל" : inv.allowedServices.map((s) => SERVICE_LABEL[s]).join(" · ") || "—"}
                  </p>
                </div>
                <CopyLink token={inv.token} />
                <button onClick={() => revokeInvite(inv.token)} className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50" title="בטל הזמנה">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Users */}
      <section>
        <h2 className="font-bold text-[#111b21] mb-3">משתמשים {data ? `(${data.users.length})` : ""}</h2>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {!data ? (
            <p className="p-4 text-sm text-gray-400">טוען…</p>
          ) : data.users.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">אין משתמשים עדיין</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-2.5">משתמש</th>
                  <th className="text-right font-medium px-4 py-2.5">גישה</th>
                  <th className="text-right font-medium px-4 py-2.5">סטטוס</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#111b21]">{u.name || u.email}</p>
                      <p dir="ltr" className="text-xs text-gray-400 text-right">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#563554]/10 px-2.5 py-1 text-xs font-semibold text-[#563554]">
                          <Shield size={12} /> מנהל
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.allowedServices.length ? (
                            u.allowedServices.map((s) => (
                              <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                {SERVICE_LABEL[s]}
                                {s === "btb" && u.btbAccountIds.length ? ` (${u.btbAccountIds.length})` : ""}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : u.status === "disabled" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                        {u.status === "active" ? "פעיל" : u.status === "disabled" ? "מושבת" : "ממתין"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {u.status === "disabled" ? (
                          <button onClick={() => setStatus(u, "active")} className="rounded-lg p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50" title="הפעל">
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button onClick={() => setStatus(u, "disabled")} className="rounded-lg p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="השבת">
                            <Ban size={15} />
                          </button>
                        )}
                        <button onClick={() => removeUser(u)} className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50" title="מחק">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
