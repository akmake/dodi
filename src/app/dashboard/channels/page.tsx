"use client";

/**
 * Channels ([קטגוריה 1]) — connected channel accounts + adapter capabilities. Live /api/channels.
 */
import { useCallback, useEffect, useState } from "react";
import { Radio, Plus, AlertCircle, Loader2, Check, X } from "lucide-react";

interface Adapter {
  type: string;
  canSendFreeform: boolean;
  supportsMedia: boolean;
  supportsTemplates: boolean;
}
interface Channel {
  id: string;
  type: string;
  name: string;
  status: string;
}

const LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  web_chat: "צ'אט באתר",
  email: "אימייל",
  instagram: "Instagram",
  sms: "SMS",
};

export default function ChannelsPage() {
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [items, setItems] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("whatsapp");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/channels", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setAdapters(j.adapters ?? []);
      setItems(j.items ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/channels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setName("");
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
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>ערוצים</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>חשבונות ערוץ מחוברים ויכולות לכל אדפטר</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>חיבור ערוץ</div>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
            {adapters.map((a) => <option key={a.type} value={a.type}>{LABELS[a.type] ?? a.type}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם תצוגה"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          <button onClick={add} disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            חבר ערוץ
          </button>
        </div>

        <div className="col-span-2 space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            <div className="px-4 py-2.5 text-xs font-semibold" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--bg-border)" }}>אדפטרים זמינים</div>
            {adapters.map((a) => (
              <div key={a.type} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{LABELS[a.type] ?? a.type}</span>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Cap ok={a.canSendFreeform} label="חופשי" />
                  <Cap ok={a.supportsMedia} label="מדיה" />
                  <Cap ok={a.supportsTemplates} label="תבניות" />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
            <div className="px-4 py-2.5 text-xs font-semibold" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--bg-border)" }}>ערוצים מחוברים</div>
            {loading ? (
              <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Radio size={24} className="mb-2 opacity-30" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין ערוצים מחוברים</p>
              </div>
            ) : (
              items.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{c.name} <span className="text-xs" style={{ color: "var(--text-muted)" }}>({LABELS[c.type] ?? c.type})</span></span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{c.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cap({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {ok ? <Check size={12} style={{ color: "var(--accent)" }} /> : <X size={12} style={{ color: "var(--text-dim)" }} />}
      {label}
    </span>
  );
}
