"use client";
// Port of Whatsapp/client/src/components/admin/tabs/TabNotes.jsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { wtmApi } from "@/lib/wtmbtb/api";

const PRIORITY: Record<string, any> = {
  low: { label: "נמוכה", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  medium: { label: "בינונית", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  high: { label: "גבוהה", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  critical: { label: "קריטי", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

function NoteCard({ note: n, onToggle, onDelete }: { note: any; onToggle: (n: any) => void; onDelete: (id: string) => void }) {
  const p = PRIORITY[n.priority] || PRIORITY.medium;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(n)}
          title={n.resolved ? "פתח מחדש" : "סמן כסגור"}
          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition flex items-center justify-center ${n.resolved ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-indigo-400"}`}
        >
          {n.resolved && <span className="text-white text-[10px] leading-none">✓</span>}
        </button>
        <div className="flex-1 text-right min-w-0">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${p.bg} ${p.color}`}>{p.label}</span>
            <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleDateString("he-IL")}</span>
            {n.createdBy && <span className="text-xs text-slate-400">{n.createdBy.split("@")[0]}</span>}
          </div>
          <p className={`text-sm text-slate-800 leading-relaxed ${n.resolved ? "line-through text-slate-400" : ""}`}>{n.content}</p>
        </div>
        <button onClick={() => onDelete(n._id)} className="text-slate-200 hover:text-red-400 transition text-xl leading-none flex-shrink-0 mt-0.5">
          ×
        </button>
      </div>
    </div>
  );
}

export default function TabNotes({ tenantId }: { tenantId: string }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setNotes((await wtmApi.get<any[]>(`/clients/${tenantId}/notes`)).data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await wtmApi.post(`/clients/${tenantId}/notes`, { content, priority });
      setShowForm(false);
      setContent("");
      setPriority("medium");
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleResolve = async (note: any) => {
    await wtmApi.put(`/clients/${tenantId}/notes/${note._id}`, { resolved: !note.resolved });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("למחוק הערה זו?")) return;
    await wtmApi.del(`/clients/${tenantId}/notes/${id}`);
    load();
  };

  const open = notes.filter((n) => !n.resolved);
  const closed = notes.filter((n) => n.resolved);

  return (
    <div className="p-6 space-y-5">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          הוסף הערת תמיכה
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 transition">
              ביטול
            </button>
            <h3 className="text-sm font-semibold text-slate-800">הערה חדשה</h3>
          </div>
          <form onSubmit={add} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-2 block">עדיפות</label>
              <div className="flex gap-2">
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPriority(k)}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition ${priority === k ? `${v.bg} ${v.color}` : "bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">תוכן ההערה</label>
              <textarea
                required
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition resize-none"
                placeholder="תאר את הבעיה או הפעולה הנדרשת..."
              />
            </div>
            <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition">
              {saving ? "שומר..." : "הוסף הערה"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-sm text-slate-400">אין הערות פתוחות</p>
        </div>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 text-right mb-2">פתוחות ({open.length})</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {open.map((n) => (
                  <NoteCard key={n._id} note={n} onToggle={toggleResolve} onDelete={del} />
                ))}
              </div>
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 text-right mb-2">סגורות ({closed.length})</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 opacity-60">
                {closed.map((n) => (
                  <NoteCard key={n._id} note={n} onToggle={toggleResolve} onDelete={del} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
