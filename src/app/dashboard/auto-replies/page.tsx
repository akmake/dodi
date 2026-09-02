"use client";

import { useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface Rule { id: string; trigger: string; matchType: string; response: string; active: boolean; }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>{children}</div>;
}

const defaultRules: Rule[] = [
  { id: "1", trigger: "שלום", matchType: "contains", response: "שלום! איך אפשר לעזור לך היום? 😊", active: true },
  { id: "2", trigger: "מחיר", matchType: "contains", response: "לפרטים על מחירים, צור קשר עם הצוות שלנו.", active: true },
  { id: "3", trigger: "שעות פתיחה", matchType: "contains", response: "אנחנו פתוחים ראשון עד חמישי 9:00-18:00.", active: false },
];

const matchLabels: Record<string, string> = {
  contains: "מכיל",
  exact: "מדויק",
  starts_with: "מתחיל ב",
  ends_with: "מסתיים ב",
};

export default function AutoRepliesPage() {
  const [rules, setRules] = useState<Rule[]>(defaultRules);
  const [showAdd, setShowAdd] = useState(false);
  const [trigger, setTrigger] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [response, setResponse] = useState("");

  function toggle(id: string) { setRules(r => r.map(x => x.id === id ? { ...x, active: !x.active } : x)); }
  function remove(id: string) { setRules(r => r.filter(x => x.id !== id)); }
  function add() {
    if (!trigger || !response) return;
    setRules(r => [...r, { id: Date.now().toString(), trigger, matchType, response, active: true }]);
    setTrigger(""); setResponse(""); setShowAdd(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>מענה אוטומטי</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>תגובות מבוססות מילות מפתח — מופעלות לפני ה-AI</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}>
          <Plus size={14} /> הוסף כלל
        </button>
      </div>

      {showAdd && (
        <Card>
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>כלל חדש</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>מילת מפתח</label>
              <input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="לדוגמה: שלום, מחיר, ביטול..."
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>סוג התאמה</label>
              <select value={matchType} onChange={e => setMatchType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                <option value="contains">מכיל</option>
                <option value="exact">מדויק</option>
                <option value="starts_with">מתחיל ב</option>
                <option value="ends_with">מסתיים ב</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>הודעת תגובה</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={3}
              placeholder="מה הבוט יענה כשמישהו כותב את מילת המפתח?"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-base)", color: "var(--text-muted)", border: "1px solid var(--bg-border)" }}>ביטול</button>
            <button onClick={add} className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}>הוסף</button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>כללים קיימים ({rules.length})</p>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{rules.filter(r => r.active).length} פעילים</span>
        </div>
        {rules.length === 0 ? (
          <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">אין כללות עדיין. הוסף את הכלל הראשון!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-start gap-3 p-3 rounded-lg"
                style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", opacity: rule.active ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>
                      {rule.trigger}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{matchLabels[rule.matchType]}</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>← {rule.response}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(rule.id)}>
                    {rule.active
                      ? <ToggleRight size={22} style={{ color: "var(--accent)" }} />
                      : <ToggleLeft size={22} style={{ color: "var(--text-dim)" }} />}
                  </button>
                  <button onClick={() => remove(rule.id)}>
                    <Trash2 size={15} style={{ color: "#EF4444" }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
