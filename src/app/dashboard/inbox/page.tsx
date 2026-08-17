"use client";

/**
 * Unified Inbox ([קטגוריה 3]).
 *
 * Connected to the new module API:
 *   GET  /api/inbox/conversations            → list
 *   GET  /api/inbox/conversations/{id}        → view (messages + contact)
 *   POST /api/inbox/conversations/{id}/messages → reply / internal note
 *   PATCH/api/inbox/conversations/{id}        → status / read
 *
 * Near-real-time via polling (websocket is the §3.1 upgrade). RTL throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Paperclip,
  Phone,
  Send,
  Sparkles,
  StickyNote,
  Tag,
  Video,
  Loader2,
} from "lucide-react";

type OptIn = "opted_in" | "opted_out" | "unknown";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  status: string;
  tags: string[];
  marketingOptIn: OptIn;
}

interface Conversation {
  id: string;
  waId: string;
  contactName: string | null;
  status: "open" | "pending" | "snoozed" | "closed";
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  serviceWindowExpiresAt: string | null;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  sender: "contact" | "agent" | "ai" | "system";
  isInternalNote: boolean;
  text: string | null;
  type: string;
  status: string | null;
  sentAt: string | null;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
}

interface ListItem {
  conversation: Conversation;
  contact: Contact | null;
}

interface View {
  conversation: Conversation;
  contact: Contact | null;
  messages: Message[];
}

const STATUS_LABEL: Record<Conversation["status"], string> = {
  open: "פתוחה",
  pending: "ממתינה",
  snoozed: "נדחתה",
  closed: "סגורה",
};

export default function InboxPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assist, setAssist] = useState<{ suggestedReply: string; summary: string; nextAction: string } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadView = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      setView(await res.json());
    } catch {
      /* keep current view */
    }
  }, []);

  // Initial load + realtime stream (falls back to polling if SSE fails).
  useEffect(() => {
    loadList();
    let poll: ReturnType<typeof setInterval> | null = null;
    const es = new EventSource("/api/inbox/stream");
    es.addEventListener("conversations", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setItems(data.items ?? []);
        setLoaded(true);
      } catch {
        /* ignore malformed stream payload */
      }
    });
    es.onerror = () => {
      es.close();
      if (!poll) poll = setInterval(loadList, 10_000);
    };
    return () => {
      es.close();
      if (poll) clearInterval(poll);
    };
  }, [loadList]);

  // Poll the open conversation.
  useEffect(() => {
    if (!selectedId) return;
    loadView(selectedId);
    const t = setInterval(() => loadView(selectedId), 5_000);
    return () => clearInterval(t);
  }, [selectedId, loadView]);

  // Scroll to newest on view change.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [view?.messages.length]);

  async function runAssist() {
    if (!selectedId || assisting) return;
    setAssisting(true);
    try {
      const res = await fetch("/api/agent-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId }),
      });
      if (res.ok) setAssist(await res.json());
    } catch {
      /* non-fatal */
    } finally {
      setAssisting(false);
    }
  }

  async function selectConversation(id: string) {
    setSelectedId(id);
    setView(null);
    setAssist(null);
    await fetch(`/api/inbox/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    }).catch(() => {});
    loadList();
  }

  async function send() {
    if (!draft.trim() || !selectedId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft, kind: noteMode ? "note" : "reply" }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.code === 131047 ? "השיחה מחוץ לחלון 24 השעות — נדרשת תבנית מאושרת." : e.error);
      }
      setDraft("");
      await loadView(selectedId);
      loadList();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSending(false);
    }
  }

  async function uploadAttachment(file: File | null) {
    if (!file || !selectedId || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/inbox/conversations/${selectedId}/media`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.code === 131047 ? "השיחה מחוץ לחלון 24 השעות — נדרשת תבנית מאושרת." : e.error);
      }
      await loadView(selectedId);
      loadList();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = items.filter((it) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (it.conversation.contactName ?? "").toLowerCase().includes(q) ||
      it.conversation.waId.includes(q) ||
      (it.contact?.phone ?? "").includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            הודעות נכנסות
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            כל השיחות עם הלקוחות במקום אחד
          </p>
        </div>
        <MentionsBell onOpen={(conversationId) => conversationId && selectConversation(conversationId)} />
      </div>

      {error && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg"
          style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-4 h-[620px]">
        {/* Conversation list */}
        <div
          className="w-72 rounded-xl flex flex-col overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
        >
          <div className="p-3 border-b" style={{ borderColor: "var(--bg-border)" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש שיחות..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center px-4">
                  <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {loaded ? "אין שיחות עדיין" : "טוען..."}
                  </p>
                </div>
              </div>
            ) : (
              filtered.map((it) => {
                const c = it.conversation;
                const active = c.id === selectedId;
                const name = c.contactName || it.contact?.firstName || `+${c.waId}`;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    className="w-full text-right px-3 py-3 border-b transition-colors"
                    style={{
                      borderColor: "var(--bg-border)",
                      background: active ? "var(--accent-light)" : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {name}
                      </span>
                      {c.unreadCount > 0 && (
                        <span
                          className="text-[11px] px-1.5 rounded-full text-white shrink-0"
                          style={{ background: "var(--accent)" }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {c.lastMessagePreview ?? "—"}
                      </span>
                      <span className="text-[11px] shrink-0" style={{ color: "var(--text-dim)" }}>
                        {fmtTime(c.lastMessageAt)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div
          className="flex-1 rounded-xl flex flex-col overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
        >
          {!view ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                בחר שיחה כדי להציג אותה
              </p>
            </div>
          ) : (
            <>
              <div
                className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: "var(--bg-border)" }}
              >
                <div>
                  <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {view.conversation.contactName || view.contact?.firstName || `+${view.conversation.waId}`}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {STATUS_LABEL[view.conversation.status]} · {windowLabel(view.conversation.serviceWindowExpiresAt)}
                  </div>
                </div>
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {view.messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </div>

              <div className="p-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setNoteMode(false)}
                    className="text-xs px-2.5 py-1 rounded-full"
                    style={{
                      background: !noteMode ? "var(--accent-light)" : "var(--bg-base)",
                      color: !noteMode ? "var(--accent-dark)" : "var(--text-muted)",
                      border: "1px solid var(--bg-border)",
                    }}
                  >
                    תשובה ללקוח
                  </button>
                  <button
                    onClick={() => setNoteMode(true)}
                    className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{
                      background: noteMode ? "#FEF9C3" : "var(--bg-base)",
                      color: noteMode ? "#854D0E" : "var(--text-muted)",
                      border: "1px solid var(--bg-border)",
                    }}
                  >
                    <StickyNote size={12} /> הערה פנימית
                  </button>
                </div>
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(e) => uploadAttachment(e.target.files?.[0] ?? null)}
                  />
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={noteMode ? "כתוב הערה פנימית (לא נשלחת ללקוח)..." : "כתוב הודעה..."}
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--bg-border)",
                      color: "var(--text-primary)",
                      maxHeight: 120,
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !selectedId}
                    className="p-2.5 rounded-lg disabled:opacity-40"
                    style={{ background: "var(--bg-base)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}
                    title="צרף קובץ"
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    onClick={send}
                    disabled={sending || uploading || !draft.trim()}
                    className="p-2.5 rounded-lg text-white disabled:opacity-40"
                    style={{ background: "var(--accent)" }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Contact card */}
        <div
          className="w-64 rounded-xl p-4 overflow-y-auto"
          style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
        >
          {view ? (
            <div className="space-y-4">
              <CopilotCard
                assist={assist}
                assisting={assisting}
                onRun={runAssist}
                onUse={(t) => { setNoteMode(false); setDraft(t); }}
              />
              <ContactCard contact={view.contact} conversation={view.conversation} />
            </div>
          ) : (
            <p className="text-sm text-center mt-8" style={{ color: "var(--text-muted)" }}>
              כרטיס לקוח
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  if (m.isInternalNote) {
    return (
      <div className="flex justify-center">
        <div
          className="text-xs px-3 py-1.5 rounded-lg max-w-[80%]"
          style={{ background: "#FEF9C3", color: "#854D0E", border: "1px solid #FDE68A" }}
        >
          📝 {m.text}
        </div>
      </div>
    );
  }
  const outbound = m.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-start" : "justify-end"}`}>
      <div
        className="text-sm px-3 py-2 rounded-2xl max-w-[75%]"
        style={{
          background: outbound ? "var(--accent-light)" : "var(--bg-base)",
          color: "var(--text-primary)",
          border: "1px solid var(--bg-border)",
        }}
      >
        {m.mediaId && <MediaContent message={m} />}
        {m.text && <div className="whitespace-pre-wrap break-words mt-1">{m.text}</div>}
        {!m.text && !m.mediaId && <div className="whitespace-pre-wrap break-words">[{m.type}]</div>}
        <div className="flex items-center gap-1 justify-end mt-1" style={{ color: "var(--text-dim)" }}>
          {m.sender === "ai" && <span className="text-[10px]">AI</span>}
          <span className="text-[10px]">{fmtTime(m.sentAt)}</span>
          {outbound && <StatusTick status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function MediaContent({ message }: { message: Message }) {
  const src = `/api/inbox/media/${message.id}`;
  const mime = message.mediaMimeType ?? "";
  const filename = message.mediaFilename || labelForType(message.type);

  if (mime.startsWith("image/") || message.type === "image") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={filename} className="max-h-64 max-w-full rounded-lg object-contain" />
      </a>
    );
  }

  if (mime.startsWith("video/") || message.type === "video") {
    return <video src={src} controls className="max-h-64 max-w-full rounded-lg" />;
  }

  if (mime.startsWith("audio/") || message.type === "audio") {
    return <audio src={src} controls className="w-64 max-w-full" />;
  }

  const Icon = message.type === "video" ? Video : message.type === "audio" ? Mic : message.type === "image" ? ImageIcon : FileText;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
      style={{ background: "rgba(255,255,255,0.45)", border: "1px solid var(--bg-border)" }}
    >
      <Icon size={16} />
      <span className="truncate max-w-52">{filename}</span>
    </a>
  );
}

function labelForType(type: string): string {
  switch (type) {
    case "image":
      return "תמונה";
    case "video":
      return "וידאו";
    case "audio":
      return "אודיו";
    case "document":
      return "מסמך";
    default:
      return "קובץ";
  }
}

function StatusTick({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck size={12} style={{ color: "var(--accent)" }} />;
  if (status === "delivered") return <CheckCheck size={12} />;
  if (status === "failed") return <AlertCircle size={12} style={{ color: "#DC2626" }} />;
  if (status === "sent" || status === "accepted") return <Check size={12} />;
  return null;
}

function CopilotCard({
  assist,
  assisting,
  onRun,
  onUse,
}: {
  assist: { suggestedReply: string; summary: string; nextAction: string } | null;
  assisting: boolean;
  onRun: () => void;
  onUse: (text: string) => void;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--accent-light)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent-dark)" }}>
          <Sparkles size={14} /> Copilot
        </span>
        <button onClick={onRun} disabled={assisting}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}>
          {assisting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {assist ? "רענן" : "הצע"}
        </button>
      </div>
      {!assist ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>הצעת תשובה, סיכום וצעד הבא — מבוססי AI</p>
      ) : (
        <div className="space-y-2">
          {assist.summary && (
            <div>
              <div className="text-[11px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>סיכום</div>
              <div className="text-xs" style={{ color: "var(--text-primary)" }}>{assist.summary}</div>
            </div>
          )}
          {assist.nextAction && (
            <div>
              <div className="text-[11px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>צעד הבא</div>
              <div className="text-xs" style={{ color: "var(--text-primary)" }}>{assist.nextAction}</div>
            </div>
          )}
          {assist.suggestedReply && (
            <div>
              <div className="text-[11px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>הצעת תשובה</div>
              <div className="text-xs p-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}>
                {assist.suggestedReply}
              </div>
              <button onClick={() => onUse(assist.suggestedReply)}
                className="w-full mt-1.5 text-xs font-medium py-1.5 rounded-lg"
                style={{ background: "var(--bg-card)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                השתמש כתשובה
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact, conversation }: { contact: Contact | null; conversation: Conversation }) {
  const name = contact?.firstName || conversation.contactName || `+${conversation.waId}`;
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          {name.slice(0, 1)}
        </div>
        <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{name}</div>
      </div>
      <Row icon={<Phone size={14} />} label="טלפון" value={contact?.phone ?? `+${conversation.waId}`} />
      {contact && (
        <>
          <Row label="סטטוס" value={contact.status} />
          <Row
            label="דיוור"
            value={
              contact.marketingOptIn === "opted_in"
                ? "מאושר"
                : contact.marketingOptIn === "opted_out"
                ? "בוטל"
                : "לא ידוע"
            }
          />
          {contact.tags.length > 0 && (
            <div>
              <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Tag size={12} /> תגיות
              </div>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function windowLabel(expiresAt: string | null): string {
  if (!expiresAt) return "חלון 24ש' סגור";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "חלון 24ש' סגור";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `נותרו ${h}ש' ${m}ד' בחלון`;
}

interface MentionItem { id: string; conversationId: string; text: string; read: boolean; createdAt: string }

/** Bell showing unread @mentions (§3.3); clicking one opens its conversation. */
function MentionsBell({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const [items, setItems] = useState<MentionItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/inbox/mentions?unread=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function openMention(m: MentionItem) {
    await fetch("/api/inbox/mentions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) });
    setOpen(false);
    onOpen(m.conversationId);
    load();
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }} title="אזכורים">
        <AtSign size={18} color="var(--text-muted)" />
        {items.length > 0 && (
          <span style={{ position: "absolute", top: -4, left: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{items.length}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", width: 300, zIndex: 50, background: "var(--bg-card)", border: "1px solid var(--bg-border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", overflow: "hidden" }}>
          <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--bg-border)" }}>אזכורים שלא נקראו</div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>אין אזכורים חדשים</div>
          ) : (
            items.map((m) => (
              <button key={m.id} onClick={() => openMention(m)} className="w-full text-right px-3 py-2.5" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="text-xs" style={{ color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.text}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{fmtTime(m.createdAt)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
