"use client";

/**
 * Contacts / CRM ([קטגוריה 4]) — live search + list from /api/contacts.
 */
import { useCallback, useEffect, useState } from "react";
import { Search, AlertCircle, Users } from "lucide-react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  status: string;
  tags: string[];
  marketingOptIn: string;
  lastActivityAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: "חדש", active: "פעיל", customer: "לקוח", churned: "נטש", blocked: "חסום",
};

export default function ContactsPage() {
  const [items, setItems] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/contacts?query=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setItems((await r.json()).items ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>אנשי קשר</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>כרטיסי הלקוחות — נוצרים אוטומטית מכל שיחה</p>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute top-2.5 right-3" style={{ color: "var(--text-dim)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם / טלפון..."
          className="w-full pr-9 pl-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", color: "var(--text-primary)", paddingInlineStart: 36 }} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}>
          <AlertCircle size={16} /><span>{error.includes("MONGODB") ? "לא מחובר למסד נתונים" : error}</span>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
        {loading ? (
          <p className="text-sm p-4" style={{ color: "var(--text-muted)" }}>טוען...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users size={28} className="mb-2 opacity-30" />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין אנשי קשר עדיין</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--bg-border)" }}>
                <Th>שם</Th><Th>טלפון</Th><Th>סטטוס</Th><Th>דיוור</Th><Th>תגיות</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--bg-border)" }}>
                  <Td><span style={{ color: "var(--text-primary)" }}>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</span></Td>
                  <Td>{c.phone}</Td>
                  <Td>{STATUS_LABEL[c.status] ?? c.status}</Td>
                  <Td>{c.marketingOptIn === "opted_in" ? "מאושר" : c.marketingOptIn === "opted_out" ? "בוטל" : "לא ידוע"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>{t}</span>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right font-medium px-4 py-2.5">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{children}</td>;
}
