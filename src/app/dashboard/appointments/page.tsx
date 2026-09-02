"use client";

/**
 * Appointments / resources dashboard ([קטגוריה 13]).
 * Define bookable resources (staff, rooms, services) with weekly working hours
 * and a slot length; the booking node + AI compute free slots from this. Until
 * now resources existed only via the API — this is the management UI.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Trash2, Pencil, Save, X, Loader2, Clock, Power } from "lucide-react";

interface WorkingWindow { weekday: number; startMinutes: number; endMinutes: number }
interface Resource {
  id: string;
  name: string;
  slotMinutes: number;
  workingHours: WorkingWindow[];
  active: boolean;
}

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12 };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--bg-border)", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", cursor: "pointer" };

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export default function AppointmentsPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/appointments/resources")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setResources(d.items ?? []))
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function toggleActive(r: Resource) {
    await fetch(`/api/appointments/resources/${r.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }),
    });
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <CalendarClock size={22} /> תורים ומשאבים
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            הגדר משאבים שניתן לקבוע להם תור — איש צוות, חדר או שירות — עם שעות עבודה ואורך פגישה. הבוט מחשב מהם זמנים פנויים אוטומטית.
          </p>
        </div>
        <button onClick={() => setEditing("new")} style={primaryBtn}><Plus size={15} /> משאב חדש</button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, display: "flex", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 className="animate-spin" size={20} /></div>
      ) : resources.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: "center" }}>
          <CalendarClock size={40} className="mx-auto mb-3 opacity-20" />
          <h3 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>אין עדיין משאבים</h3>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>צור משאב ראשון — למשל "ד"ר כהן", "חדר טיפולים" או "תספורת"</p>
          <button onClick={() => setEditing("new")} style={{ ...primaryBtn, margin: "0 auto" }}><Plus size={15} /> צור משאב ראשון</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {resources.map((r) => (
            <div key={r.id} style={{ ...card, padding: 16, opacity: r.active ? 1 : 0.6 }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
                <span style={{ fontSize: 11, color: r.active ? "var(--accent)" : "var(--text-muted)", fontWeight: 600 }}>{r.active ? "פעיל" : "מושבת"}</span>
              </div>
              <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Clock size={12} /> פגישה של {r.slotMinutes} דק׳</p>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                {r.workingHours.length ? [...new Set(r.workingHours.map((w) => w.weekday))].sort().map((d) => WEEKDAYS[d]).join(", ") : "ללא שעות עבודה"}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditing(r)} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}><Pencil size={13} /> עריכה</button>
                <button onClick={() => toggleActive(r)} title={r.active ? "השבת" : "הפעל"} style={ghostBtn}><Power size={13} /></button>
                <button onClick={async () => { if (confirm(`למחוק את "${r.name}"? תורים עתידיים יבוטלו.`)) { await fetch(`/api/appointments/resources/${r.id}`, { method: "DELETE" }); reload(); } }} style={{ ...ghostBtn, background: "#FEE2E2", color: "#DC2626", border: "none" }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ResourceModal resource={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function ResourceModal({ resource, onClose, onSaved }: { resource: Resource | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(resource?.name ?? "");
  const [slotMinutes, setSlotMinutes] = useState(resource?.slotMinutes ?? 30);
  // Index working windows by weekday for the editor (one window per day here).
  const initial: Record<number, { on: boolean; start: string; end: string }> = {};
  for (let d = 0; d < 7; d++) {
    const w = resource?.workingHours.find((x) => x.weekday === d);
    initial[d] = w ? { on: true, start: toTime(w.startMinutes), end: toTime(w.endMinutes) }
      : { on: [0, 1, 2, 3, 4].includes(d) && !resource, start: "09:00", end: "17:00" };
  }
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDay = (d: number, patch: Partial<{ on: boolean; start: string; end: string }>) => setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));

  async function save() {
    setError(null);
    if (!name.trim()) { setError("שם המשאב חובה"); return; }
    const workingHours: WorkingWindow[] = [];
    for (let d = 0; d < 7; d++) {
      if (!hours[d].on) continue;
      const startMinutes = toMinutes(hours[d].start);
      const endMinutes = toMinutes(hours[d].end);
      if (endMinutes <= startMinutes) { setError(`ב${WEEKDAYS[d]}: שעת הסיום חייבת להיות אחרי ההתחלה`); return; }
      workingHours.push({ weekday: d, startMinutes, endMinutes });
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), slotMinutes, workingHours };
      const res = resource
        ? await fetch(`/api/appointments/resources/${resource.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/appointments/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "שמירה נכשלה"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 520, maxWidth: "94%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{resource ? "עריכת משאב" : "משאב חדש"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--text-muted)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>שם המשאב</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ד״ר כהן" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>אורך פגישה (דקות)</label>
              <input type="number" min={5} step={5} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value) || 30)} style={input} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>שעות עבודה</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {WEEKDAYS.map((day, d) => (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, width: 80, fontSize: 13, color: "var(--text-primary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={hours[d].on} onChange={(e) => setDay(d, { on: e.target.checked })} /> {day}
                  </label>
                  <input type="time" value={hours[d].start} disabled={!hours[d].on} onChange={(e) => setDay(d, { start: e.target.value })} style={{ ...input, width: 120, opacity: hours[d].on ? 1 : 0.4 }} />
                  <span style={{ color: "var(--text-muted)" }}>–</span>
                  <input type="time" value={hours[d].end} disabled={!hours[d].on} onChange={(e) => setDay(d, { end: e.target.value })} style={{ ...input, width: 120, opacity: hours[d].on ? 1 : 0.4 }} />
                </div>
              ))}
            </div>
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
