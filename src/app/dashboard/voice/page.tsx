"use client";

/**
 * Voice / Contact Center ([קטגוריה 26]) — IVR flow management + call log.
 * Build a phone menu (greeting + nodes), enable one flow, and review recent
 * calls. The carrier (Twilio/Vonage…) drives calls via /api/voice/webhook.
 */
import { useCallback, useEffect, useState } from "react";
import { Phone, Plus, Trash2, Power, Save, X, Loader2, PhoneIncoming } from "lucide-react";

type IvrAction = "play" | "menu" | "dial_agent" | "dial_team" | "voicebot" | "voicemail" | "hangup";
interface IvrNode { id: string; action: IvrAction; prompt?: string; options?: { digit: string; nextId: string }[]; nextId?: string; target?: string }
interface Flow { id: string; name: string; greeting: string; nodes: IvrNode[]; rootNodeId: string | null; enabled: boolean }
interface Call { id: string; from: string; to: string; status: string; startedAt: string; recordingUrl: string | null; transcript: string | null }

const ACTION_LABEL: Record<IvrAction, string> = {
  play: "השמע הודעה", menu: "תפריט (הקשה)", dial_agent: "חבר לנציג", dial_team: "חבר לצוות", voicebot: "בוט קולי", voicemail: "תא קולי", hangup: "נתק",
};
const STATUS_LABEL: Record<string, string> = {
  ringing: "מצלצל", in_ivr: "בתפריט", in_queue: "בתור", connected: "מחובר", voicemail: "תא קולי", completed: "הסתיים", failed: "נכשל",
};

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" };

export default function VoicePage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [editing, setEditing] = useState<Flow | "new" | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/voice/flows").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch("/api/voice/calls").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]).then(([f, c]) => { setFlows(f.items ?? []); setCalls(c.items ?? []); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(f: Flow) {
    await fetch(`/api/voice/flows/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !f.enabled }) });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Phone size={22} /> מוקד טלפוני</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>תפריט קולי (IVR), ניתוב לנציגים, תא קולי ותמלול — מחובר לספק טלפוניה דרך webhook.</p>
        </div>
        <button onClick={() => setEditing("new")} style={primaryBtn}><Plus size={15} /> תרחיש IVR</button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 className="animate-spin" size={20} /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {flows.length === 0 ? (
              <div style={{ ...card, padding: 32, textAlign: "center", gridColumn: "span 3" }}>
                <Phone size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין תרחישי IVR. צור את הראשון.</p>
              </div>
            ) : flows.map((f) => (
              <div key={f.id} style={{ ...card, padding: 16, opacity: f.enabled ? 1 : 0.6 }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{f.name}</h3>
                  <span style={{ fontSize: 11, color: f.enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 600 }}>{f.enabled ? "פעיל" : "כבוי"}</span>
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{f.nodes.length} צמתים</p>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(f)} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>עריכה</button>
                  <button onClick={() => toggle(f)} style={ghostBtn}><Power size={13} /></button>
                  <button onClick={async () => { if (confirm(`למחוק את "${f.name}"?`)) { await fetch(`/api/voice/flows/${f.id}`, { method: "DELETE" }); load(); } }} style={{ ...ghostBtn, background: "#FEE2E2", color: "#DC2626", border: "none" }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...card, overflow: "hidden" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--bg-border)" }}>
              <PhoneIncoming size={15} style={{ color: "var(--accent)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>יומן שיחות</span>
            </div>
            {calls.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>אין שיחות עדיין.</div>
            ) : calls.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div>
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.from || "—"}</span>
                  <span className="text-xs mr-2" style={{ color: "var(--text-muted)" }}> · {new Date(c.startedAt).toLocaleString("he-IL")}</span>
                </div>
                <div className="flex items-center gap-3">
                  {c.recordingUrl && <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--accent)" }}>הקלטה</a>}
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>{STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && <FlowEditor flow={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function FlowEditor({ flow, onClose, onSaved }: { flow: Flow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(flow?.name ?? "");
  const [greeting, setGreeting] = useState(flow?.greeting ?? "שלום, הגעתם למוקד.");
  const [nodes, setNodes] = useState<IvrNode[]>(flow?.nodes ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setNode = (i: number, patch: Partial<IvrNode>) => setNodes((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const addNode = () => setNodes((ns) => [...ns, { id: `n${ns.length + 1}`, action: "play", prompt: "" }]);

  async function save() {
    setError(null);
    if (!name.trim()) { setError("שם חובה"); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), greeting, nodes, rootNodeId: nodes[0]?.id ?? null };
      const res = flow
        ? await fetch(`/api/voice/flows/${flow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/voice/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "שמירה נכשלה"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 600, maxWidth: "94%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{flow ? "עריכת תרחיש" : "תרחיש IVR חדש"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>שם</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="מוקד ראשי" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>ברכת פתיחה</label>
              <input value={greeting} onChange={(e) => setGreeting(e.target.value)} style={input} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>צמתים</span>
              <button onClick={addNode} style={ghostBtn}><Plus size={13} /> צומת</button>
            </div>
            {nodes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>הוסף צומת ראשון (הצומת הראשון הוא נקודת הכניסה).</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {nodes.map((n, i) => (
                  <div key={i} style={{ border: "1px solid var(--bg-border)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)", width: 30 }}>{n.id}</span>
                      <select value={n.action} onChange={(e) => setNode(i, { action: e.target.value as IvrAction })} style={{ ...input, width: 150 }}>
                        {(Object.keys(ACTION_LABEL) as IvrAction[]).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                      </select>
                      <input value={n.prompt ?? ""} onChange={(e) => setNode(i, { prompt: e.target.value })} placeholder="טקסט להשמעה" style={{ ...input, flex: 1 }} />
                      <button onClick={() => setNodes((ns) => ns.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={14} color="#EF4444" /></button>
                    </div>
                    {(n.action === "dial_agent" || n.action === "dial_team") && (
                      <input value={n.target ?? ""} onChange={(e) => setNode(i, { target: e.target.value })} placeholder="מזהה נציג/צוות" style={input} />
                    )}
                    {n.action === "menu" && (
                      <input value={(n.options ?? []).map((o) => `${o.digit}:${o.nextId}`).join(", ")}
                        onChange={(e) => setNode(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map((p) => { const [digit, nextId] = p.split(":"); return { digit: digit?.trim() ?? "", nextId: nextId?.trim() ?? "" }; }) })}
                        placeholder="ספרה:צומת — לדוגמה 1:n2, 2:n3" style={input} />
                    )}
                    {["play", "voicebot"].includes(n.action) && (
                      <input value={n.nextId ?? ""} onChange={(e) => setNode(i, { nextId: e.target.value })} placeholder="צומת המשך (id)" style={{ ...input, width: 200 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {error && <div style={{ color: "#DC2626", fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} שמור</button>
          <button onClick={onClose} style={ghostBtn}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
