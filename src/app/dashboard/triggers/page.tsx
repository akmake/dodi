"use client";

/**
 * Triggers ([קטגוריה 6]) — events that start a flow. Live /api/triggers (+/api/flows).
 */
import { useCallback, useEffect, useState } from "react";
import { Zap, Plus, AlertCircle, Loader2, Trash2, Power } from "lucide-react";

interface Trigger {
  id: string;
  type: string;
  config: Record<string, unknown>;
  targetFlowId: string;
  enabled: boolean;
}
interface FlowOpt { id: string; name: string }

const TYPES = [
  { key: "keyword", label: "מילת מפתח", configKey: "keyword", placeholder: "שלום" },
  { key: "intent", label: "כוונת AI", configKey: "intent", placeholder: "order_status" },
  { key: "webhook", label: "Webhook חיצוני", configKey: "webhookKey", placeholder: "my-key" },
  { key: "message", label: "כל הודעה", configKey: "", placeholder: "" },
];

export default function TriggersPage() {
  const [items, setItems] = useState<Trigger[]>([]);
  const [flows, setFlows] = useState<FlowOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("keyword");
  const [value, setValue] = useState("");
  const [flowId, setFlowId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tr, fr] = await Promise.all([
        fetch("/api/triggers", { cache: "no-store" }),
        fetch("/api/flows", { cache: "no-store" }),
      ]);
      if (!tr.ok) throw new Error((await tr.json()).error ?? `HTTP ${tr.status}`);
      setItems((await tr.json()).items ?? []);
      if (fr.ok) {
        const f = (await fr.json()).flows ?? [];
        setFlows(f.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        if (!flowId && f[0]) setFlowId(f[0].id);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!flowId || saving) return;
    const t = TYPES.find((x) => x.key === type)!;
    if (t.configKey && !value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const config = t.configKey ? { [t.configKey]: value.trim() } : {};
      const r = await fetch("/api/triggers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config, targetFlowId: flowId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setValue("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(tr: Trigger) {
    await fetch(`/api/triggers/${tr.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !tr.enabled }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הטריגר?")) return;
    await fetch(`/api/triggers/${id}`, { method: "DELETE" });
    await load();
  }

  const t = TYPES.find((x) => x.key === type)!;
  const flowName = (id: string) => flows.find((f) => f.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>טריגרים</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>אירועים שמפעילים תהליך שיחה אוטומטית</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>טריגר חדש</div>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          {t.configKey && (
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t.placeholder}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          )}
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {flows.length === 0 ? <option value="">— אין תהליכים —</option> : flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button onClick={add} disabled={saving || !flowId || (!!t.configKey && !value.trim())}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            צור טריגר
          </button>
        </div>

        <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Zap size={28} className="mb-2 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין טריגרים עדיין</p>
            </div>
          ) : (
            items.map((tr) => (
              <div key={tr.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)", opacity: tr.enabled ? 1 : 0.5 }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Zap size={15} style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{tr.type}</span>
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {Object.values(tr.config).map(String).join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>→ {flowName(tr.targetFlowId)}</span>
                  <button onClick={() => toggle(tr)} title={tr.enabled ? "השבת" : "הפעל"} style={{ color: tr.enabled ? "#16A34A" : "var(--text-muted)" }}><Power size={14} /></button>
                  <button onClick={() => remove(tr.id)} title="מחק" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
