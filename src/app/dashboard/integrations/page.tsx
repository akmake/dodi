"use client";

/**
 * Integrations ([קטגוריה 22]) — outbound webhooks + public API keys.
 * Live /api/integrations/*.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Webhook, KeyRound, Plus, AlertCircle, Loader2, Trash2, Copy, CheckCircle2,
} from "lucide-react";

interface Subscription {
  id: string;
  targetUrl: string;
  events: string[];
  active: boolean;
  failureCount: number;
  lastDelivery: { status: string; code: number } | null;
}
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
}

function Reveal({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg p-3 mt-1" style={{ background: "#ECFDF5", border: "1px solid #6EE7B7" }}>
      <div className="text-xs font-medium mb-1" style={{ color: "#047857" }}>{label} — שמור עכשיו, לא יוצג שוב</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono break-all" style={{ color: "#065F46" }}>{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); }} title="העתק" style={{ color: "#047857" }}>
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [tab, setTab] = useState<"webhooks" | "keys">("webhooks");
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [scopeTypes, setScopeTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // webhook form
  const [url, setUrl] = useState("");
  const [pickedEvents, setPickedEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  // key form
  const [keyName, setKeyName] = useState("");
  const [pickedScopes, setPickedScopes] = useState<string[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, k] = await Promise.all([
        fetch("/api/integrations/webhooks", { cache: "no-store" }),
        fetch("/api/integrations/api-keys", { cache: "no-store" }),
      ]);
      if (!w.ok) throw new Error((await w.json()).error ?? `HTTP ${w.status}`);
      const wj = await w.json();
      setSubs(wj.items ?? []); setEventTypes(wj.events ?? []);
      if (k.ok) { const kj = await k.json(); setKeys(kj.items ?? []); setScopeTypes(kj.scopes ?? []); }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(list: string[], set: (v: string[]) => void, v: string) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function addWebhook() {
    if (!url.trim() || pickedEvents.length === 0 || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/integrations/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: url, events: pickedEvents }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setNewSecret((await r.json()).secret ?? null);
      setUrl(""); setPickedEvents([]);
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  async function addKey() {
    if (!keyName.trim() || pickedScopes.length === 0 || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/integrations/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName, scopes: pickedScopes }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setNewToken((await r.json()).token ?? null);
      setKeyName(""); setPickedScopes([]);
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  async function delWebhook(id: string) { await fetch(`/api/integrations/webhooks/${id}`, { method: "DELETE" }); await load(); }
  async function revokeKey(id: string) { await fetch(`/api/integrations/api-keys/${id}`, { method: "DELETE" }); await load(); }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>אינטגרציות</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Webhooks יוצאים ומפתחות API לחיבור מערכות חיצוניות</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="flex gap-1.5">
        {([["webhooks", "Webhooks", Webhook], ["keys", "מפתחות API", KeyRound]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === k ? "var(--accent-light)" : "var(--bg-card)",
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              border: "1px solid var(--bg-border)",
            }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {tab === "webhooks" ? (
          <>
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Webhook חדש</div>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" dir="ltr"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>אירועים</div>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {eventTypes.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={pickedEvents.includes(ev)} onChange={() => toggle(pickedEvents, setPickedEvents, ev)} />
                    <code style={{ color: "var(--text-muted)" }}>{ev}</code>
                  </label>
                ))}
              </div>
              <button onClick={addWebhook} disabled={saving || !url.trim() || pickedEvents.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                צור Webhook
              </button>
              {newSecret && <Reveal label="Signing Secret" value={newSecret} />}
            </div>

            <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              {loading ? <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
                : subs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Webhook size={28} className="mb-2 opacity-30" />
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין Webhooks עדיין</p>
                  </div>
                ) : subs.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-mono truncate" style={{ color: "var(--text-primary)" }} dir="ltr">{s.targetUrl}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.events.length} אירועים{s.lastDelivery ? ` · מסירה אחרונה: ${s.lastDelivery.code}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-base)", color: s.active ? "#16A34A" : "#DC2626" }}>
                        {s.active ? "פעיל" : "מושבת"}
                      </span>
                      <button onClick={() => delWebhook(s.id)} title="מחק" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>מפתח API חדש</div>
              <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="שם המפתח (למשל: אתר החברה)"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
              <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>הרשאות (scopes)</div>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {scopeTypes.map((sc) => (
                  <label key={sc} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={pickedScopes.includes(sc)} onChange={() => toggle(pickedScopes, setPickedScopes, sc)} />
                    <code style={{ color: "var(--text-muted)" }}>{sc}</code>
                  </label>
                ))}
              </div>
              <button onClick={addKey} disabled={saving || !keyName.trim() || pickedScopes.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                צור מפתח
              </button>
              {newToken && <Reveal label="API Key" value={newToken} />}
            </div>

            <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
              {loading ? <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
                : keys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <KeyRound size={28} className="mb-2 opacity-30" />
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין מפתחות עדיין</p>
                  </div>
                ) : keys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between px-4 py-3 gap-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{k.name}</div>
                      <div className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-muted)" }} dir="ltr">{k.prefix}··· · {k.scopes.length} scopes</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-base)", color: k.active ? "#16A34A" : "#DC2626" }}>
                        {k.active ? "פעיל" : "בוטל"}
                      </span>
                      {k.active && <button onClick={() => revokeKey(k.id)} title="בטל" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
