"use client";

/**
 * Campaigns / Broadcasts ([קטגוריה 18]) — segments + campaigns, live APIs.
 * Sends an approved template to a segment, enforcing opt-in/block server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, Plus, Users, AlertCircle, CheckCircle2, Clock, SplitSquareHorizontal } from "lucide-react";

interface Segment { id: string; name: string; estimatedSize: number }
interface Template { id: string; name: string; language: string; status: string }
interface Campaign {
  id: string; name: string; segmentId: string; templateName: string;
  status: string; stats: { sent: number; skipped: number; failed: number };
  scheduledAt?: string | null; variants?: { id: string }[];
}

export default function BroadcastsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // forms
  const [segName, setSegName] = useState("");
  const [segTag, setSegTag] = useState("");
  const [cName, setCName] = useState("");
  const [cSeg, setCSeg] = useState("");
  const [cTpl, setCTpl] = useState("");
  const [cVars, setCVars] = useState("");
  const [cVariantB, setCVariantB] = useState("");
  const [cSchedule, setCSchedule] = useState("");
  const [cRrule, setCRrule] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, t, c] = await Promise.all([
        fetch("/api/segments", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/templates", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/campaigns", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (s.error) throw new Error(s.error);
      setSegments(s.items ?? []);
      setTemplates((t.items ?? []).filter((x: Template) => x.status === "APPROVED"));
      setCampaigns(c.items ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createSegment() {
    if (!segName.trim() || !segTag.trim()) return;
    setBusy("seg");
    try {
      const r = await fetch("/api/segments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: segName, type: "dynamic",
          definition: { op: "AND", rules: [{ field: "contact.tags", operator: "contains", value: segTag }] },
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setSegName(""); setSegTag("");
      await load();
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  }

  async function createCampaign() {
    if (!cName.trim() || !cSeg || !cTpl) return;
    setBusy("camp");
    try {
      const variants = cVariantB ? [{ id: "B", templateName: cVariantB }] : undefined;
      const r = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cName, segmentId: cSeg, templateName: cTpl,
          variableMapping: cVars.split(",").map((s) => s.trim()).filter(Boolean),
          variants,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const created = await r.json();
      // If a schedule was set, enqueue the send (one-off or recurring).
      if (cSchedule && created?.id) {
        await fetch(`/api/campaigns/${created.id}/schedule`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runAt: new Date(cSchedule).toISOString(), rrule: cRrule || null }),
        });
      }
      setCName(""); setCSeg(""); setCTpl(""); setCVars(""); setCVariantB(""); setCSchedule(""); setCRrule("");
      await load();
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  }

  async function sendCampaign(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error);
      await load();
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>שליחה המונית</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>קמפיינים מבוססי תבנית לסגמנט — עם אכיפת הסכמה אוטומטית</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Segments */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>סגמנטים</div>
          {segments.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-primary)" }}>{s.name}</span>
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}><Users size={12} />{s.estimatedSize}</span>
            </div>
          ))}
          <div className="pt-2 space-y-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="שם הסגמנט"
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
            <input value={segTag} onChange={(e) => setSegTag(e.target.value)} placeholder="כולל תגית..."
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
            <button onClick={createSegment} disabled={busy === "seg"} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busy === "seg" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} צור סגמנט
            </button>
          </div>
        </div>

        {/* New campaign */}
        <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>קמפיין חדש</div>
          <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="שם הקמפיין" className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
          <select value={cSeg} onChange={(e) => setCSeg(e.target.value)} className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>
            <option value="">בחר סגמנט...</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.estimatedSize})</option>)}
          </select>
          <select value={cTpl} onChange={(e) => setCTpl(e.target.value)} className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>
            <option value="">בחר תבנית מאושרת...</option>
            {templates.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.language})</option>)}
          </select>
          <input value={cVars} onChange={(e) => setCVars(e.target.value)} placeholder="מיפוי משתנים: firstName,..." className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
          <div className="flex items-center gap-1.5 text-xs pt-1" style={{ color: "var(--text-muted)" }}>
            <SplitSquareHorizontal size={13} /> וריאנט B (A/B) — אופציונלי
          </div>
          <select value={cVariantB} onChange={(e) => setCVariantB(e.target.value)} className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>
            <option value="">ללא — שליחה רגילה</option>
            {templates.filter((t) => t.name !== cTpl).map((t) => <option key={t.id} value={t.name}>{t.name} ({t.language})</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-xs pt-1" style={{ color: "var(--text-muted)" }}>
            <Clock size={13} /> תזמון — אופציונלי
          </div>
          <input type="datetime-local" value={cSchedule} onChange={(e) => setCSchedule(e.target.value)} className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
          {cSchedule && (
            <select value={cRrule} onChange={(e) => setCRrule(e.target.value)} className="w-full px-3 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">חד-פעמי</option>
              <option value="DAILY">כל יום</option>
              <option value="WEEKLY">כל שבוע</option>
              <option value="MONTHLY">כל חודש</option>
            </select>
          )}
          <button onClick={createCampaign} disabled={busy === "camp" || !cName || !cSeg || !cTpl} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {busy === "camp" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} צור קמפיין
          </button>
          {templates.length === 0 && <p className="text-xs" style={{ color: "var(--text-dim)" }}>אין תבניות מאושרות — סנכרן ב״תבניות הודעה״</p>}
        </div>

        {/* Campaigns list */}
        <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
          <div className="font-semibold text-sm mb-2" style={{ color: "var(--text-primary)" }}>קמפיינים</div>
          {campaigns.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין קמפיינים עדיין</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-lg p-2.5" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                      {c.variants && c.variants.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>
                          <SplitSquareHorizontal size={9} />A/B
                        </span>
                      )}
                    </div>
                    {c.status === "completed" ? (
                      <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "var(--accent-dark)" }}><CheckCircle2 size={13} />הסתיים</span>
                    ) : c.status === "scheduled" ? (
                      <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "#D97706" }}><Clock size={12} />{fmtSchedule(c.scheduledAt)}</span>
                    ) : (
                      <button onClick={() => sendCampaign(c.id)} disabled={busy === c.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-white disabled:opacity-50 flex-shrink-0" style={{ background: "var(--accent)" }}>
                        {busy === c.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} שלח
                      </button>
                    )}
                  </div>
                  {c.status === "completed" && (
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      נשלחו {c.stats.sent} · דולגו {c.stats.skipped} · נכשלו {c.stats.failed}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)",
};

function fmtSchedule(iso: string | null | undefined): string {
  if (!iso) return "מתוזמן";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "מתוזמן";
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
