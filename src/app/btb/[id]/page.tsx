"use client";
// Port of Whatsapp/client/src/pages/BtbPage.jsx (admin drill-in mode).
// The original also served the BTB end-customer's own login (role:client); that
// path is deferred in the unified build, so this always renders in admin mode.
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { btbApi, ApiError } from "@/lib/wtmbtb/api";
import { useSSE } from "@/lib/wtmbtb/useSSE";
import Modal from "@/components/wtmbtb/ui/Modal";
import StatusUploadModal from "@/components/wtmbtb/btb/StatusUploadModal";
import { SERVICES } from "@/lib/wtmbtb/services";
import { Home, CircleDashed, Users, Plus, Eye, RefreshCw, FlaskConical, QrCode, Link2, Image as ImageIcon, Video, Type, Check, WifiOff, Target, ChevronLeft, Search, Trash2 } from "lucide-react";

const BTB = SERVICES.btb;

const WA_BADGE: Record<string, { label: string; cls: string }> = {
  connected: { label: "מחובר", cls: "bg-green-100 text-green-700" },
  connecting: { label: "מתחבר…", cls: "bg-yellow-100 text-yellow-700" },
  waiting_qr: { label: "ממתין ל-QR", cls: "bg-yellow-100 text-yellow-700" },
  disconnected: { label: "מנותק", cls: "bg-red-100 text-red-600" },
};

const MEDIA_ICON: Record<string, any> = { image: ImageIcon, video: Video, text: Type, unknown: CircleDashed };

function fmtDate(ts: string) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}
function fmtBytes(b: number | null | undefined) {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
function fmtFps(s: any) {
  if (!s) return null;
  const [n, d] = String(s).split("/").map(Number);
  return d ? `${Math.round(n / d)}` : String(s);
}

// A WhatsApp status is "live" for 24h; after that WhatsApp drops it on its own.
const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const isStatusActive = (postedAt: string) => !!postedAt && Date.now() - new Date(postedAt).getTime() < STATUS_TTL_MS;

function ActivePill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-[#d9fdd3] text-[#075e54]" : "bg-gray-100 text-gray-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#1daa61]" : "bg-gray-400"}`} />
      {active ? "פעיל" : "פג"}
    </span>
  );
}

function ProbeReport({ probe }: { probe: any }) {
  if (!probe || (!probe.sent && !probe.original)) return null;
  const kind = probe.sent?.kind || probe.original?.kind || probe.roundtrip?.kind;
  const stages = [
    { key: "original", label: "מקור", p: probe.original, bytes: probe.originalBytes },
    { key: "sent", label: "נשלח", p: probe.sent, bytes: probe.sentBytes },
    { key: "roundtrip", label: "וואטסאפ", p: probe.roundtrip, bytes: probe.roundtripBytes },
  ];
  const metrics: [string, (p: any) => any][] =
    kind === "image"
      ? [
          ["פורמט", (p) => p?.format],
          ["רזולוציה", (p) => (p?.width && p?.height ? `${p.width}×${p.height}` : null)],
          ["Chroma", (p) => p?.chromaSubsampling],
          ["מרחב צבע", (p) => p?.space],
        ]
      : [
          ["קודק", (p) => (p?.video?.codec ? `${p.video.codec} ${p.video.profile || ""}`.trim() : null)],
          ["רזולוציה", (p) => (p?.video?.width && p?.video?.height ? `${p.video.width}×${p.video.height}` : null)],
          ["FPS", (p) => fmtFps(p?.video?.fps)],
          ["Bitrate", (p) => p?.video?.bitrate || p?.totalBitrate],
          ["עומק/פיקסל", (p) => [p?.video?.pixFmt, p?.video?.bitsPerRawSample ? `${p.video.bitsPerRawSample}-bit` : null].filter(Boolean).join(" · ") || null],
          ["Transfer", (p) => p?.video?.colorTransfer],
          ["Primaries", (p) => p?.video?.colorPrimaries],
          ["מרחב/טווח", (p) => [p?.video?.colorSpace, p?.video?.colorRange].filter(Boolean).join(" · ") || null],
          ["HDR", (p) => (p?.video?.hdr === true ? "כן" : p?.video?.hdr === false ? "לא" : null)],
          ["משך", (p) => (p?.durationSec ? `${p.durationSec.toFixed(1)}s` : null)],
        ];
  const cell = (val: any, stageKey: string) => val || (stageKey === "roundtrip" ? "…" : "—");

  return (
    <div className="mb-4 overflow-x-auto rounded-2xl border border-[#e9edef]">
      <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500">בדיקת איכות — מה וואטסאפ שינתה</div>
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="text-gray-400">
            <th className="px-3 py-1.5"></th>
            {stages.map((s) => (
              <th key={s.key} className="text-right font-medium px-3 py-1.5">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(([label, get]) => (
            <tr key={label} className="border-t border-gray-50">
              <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{label}</td>
              {stages.map((s) => (
                <td key={s.key} dir="ltr" className="px-3 py-1.5 text-right text-[#111b21]">
                  {cell(get(s.p), s.key)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-gray-50 font-semibold">
            <td className="px-3 py-1.5 text-gray-400">גודל</td>
            {stages.map((s) => (
              <td key={s.key} dir="ltr" className="px-3 py-1.5 text-right text-[#111b21]">
                {s.bytes != null ? fmtBytes(s.bytes) : s.key === "roundtrip" ? "…" : "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, sub, icon: Icon }: { label: string; value: any; sub?: string; icon?: any }) {
  return (
    <div className="rounded-2xl border border-[#e9edef] bg-[#f7f8fa] p-4 sm:p-5">
      {Icon && <Icon size={23} className="mb-3 text-[#1daa61]" strokeWidth={1.9} />}
      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111b21]">{value}</p>
      <p className="mt-0.5 text-sm text-[#667781]">{label}</p>
      {sub && <p className="mt-1 text-xs text-[#8696a0]">{sub}</p>}
    </div>
  );
}

const viewerLabel = (v: any) => v.name || v.pushName || v.phone || "לא זוהה";

function StatusCard({ s, onClick }: { s: any; onClick: () => void }) {
  const MediaIcon = MEDIA_ICON[s.mediaType] || CircleDashed;
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl p-2.5 text-right transition hover:bg-[#f5f6f6] focus:outline-none focus:ring-2 focus:ring-[#1daa61]/30">
      <div className="relative h-16 w-16 flex-none overflow-hidden rounded-full bg-[#f0f2f5] ring-[3px] ring-[#1daa61] ring-offset-2 flex items-center justify-center">
        {s.thumbnail ? (
          <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : s.mediaType === "text" ? (
          <div className="w-full h-full flex items-center justify-center p-2 text-white text-[8px] text-center leading-tight" style={{ backgroundColor: s.bgColor || "#0b6b45" }}>
            {s.caption || "טקסט"}
          </div>
        ) : (
          <MediaIcon size={27} className="text-[#667781]" />
        )}
      </div>
      <div className="min-w-0 flex-1 border-b border-[#eef0f1] py-2.5">
        <p className="truncate text-[15px] font-semibold text-[#111b21]">{s.caption || (s.mediaType === "video" ? "סטטוס וידאו" : s.mediaType === "image" ? "סטטוס תמונה" : "סטטוס טקסט")}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-[#8696a0]">
          {fmtDate(s.postedAt)}
          <ActivePill active={isStatusActive(s.postedAt)} />
        </p>
      </div>
      <div className="flex flex-none items-center gap-1 text-sm font-semibold text-[#008069]">
        <Eye size={17} />
        {s.viewsCount}
      </div>
    </button>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f2f5]">
        <CircleDashed size={30} className="text-[#8696a0]" />
      </div>
      <p className="font-bold text-[#111b21]">{title}</p>
      <p className="mt-1 text-sm text-[#8696a0]">{text}</p>
    </div>
  );
}

function AudienceRow({ viewer, index }: { viewer: any; index: number }) {
  const colors = ["bg-[#53bdeb]", "bg-[#7f66ff]", "bg-[#e56b6f]", "bg-[#00a884]"];
  const label = viewerLabel(viewer);
  return (
    <div className="flex items-center gap-3 border-b border-[#eef0f1] px-4 py-3 last:border-0 hover:bg-[#f7f8fa]">
      <div className={`flex h-12 w-12 flex-none items-center justify-center rounded-full text-lg font-bold text-white ${colors[index % colors.length]}`}>{label.charAt(0)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{label}</p>
        {viewer.phone && (
          <p dir="ltr" className="truncate text-right text-xs text-[#8696a0]">
            {viewer.phone}
          </p>
        )}
      </div>
      <span className="rounded-full bg-[#d9fdd3] px-3 py-1 text-xs font-bold text-[#075e54]">{viewer.statusesViewed} צפיות</span>
    </div>
  );
}

export default function BtbPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = (params?.id as string) || "";

  const [account, setAccount] = useState<any>(undefined);
  const [stats, setStats] = useState<any>(null);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [viewers, setViewers] = useState<any[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [selStatus, setSelStatus] = useState<any>(null);
  const [selViewers, setSelViewers] = useState<any[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [statusSearch, setStatusSearch] = useState("");
  const [test, setTest] = useState<any>(null);
  const testInput = useRef<HTMLInputElement>(null);

  const fetchMeta = useCallback(async () => {
    if (!accountId) return;
    try {
      setAccount((await btbApi.get<any>(`/accounts/${accountId}`)).data);
    } catch {
      setAccount(null);
    }
  }, [accountId]);

  const fetchDetail = useCallback(async () => {
    if (!accountId) return;
    try {
      const [s, st, v] = await Promise.all([
        btbApi.get<any>(`/accounts/${accountId}/stats`),
        btbApi.get<any[]>(`/accounts/${accountId}/statuses`, { params: { limit: 50 } }),
        btbApi.get<any[]>(`/accounts/${accountId}/top-viewers`, { params: { limit: 100 } }),
      ]);
      setStats(s.data);
      setStatuses(st.data);
      setViewers(v.data);
    } catch {
      /* next SSE/refresh will retry */
    }
  }, [accountId]);

  useEffect(() => {
    fetchMeta();
    fetchDetail();
  }, [fetchMeta, fetchDetail]);
  useSSE(() => {
    fetchMeta();
    fetchDetail();
  });
  useEffect(() => {
    const timer = setInterval(() => {
      fetchMeta();
      fetchDetail();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchMeta, fetchDetail]);

  useEffect(() => {
    setSelStatus((prev: any) => (prev ? statuses.find((s) => s._id === prev._id) || prev : prev));
  }, [statuses]);

  const pollQR = useCallback(async () => {
    try {
      const res = await btbApi.get<any>(`/accounts/${accountId}/qr`);
      if (res.data.connected) {
        setQrOpen(false);
        fetchMeta();
      } else if (res.data.qr) setQrImg(res.data.qr);
    } catch {
      /* interval will retry */
    }
  }, [accountId, fetchMeta]);

  const openQR = () => {
    setQrImg(null);
    setQrOpen(true);
    pollQR();
  };

  useEffect(() => {
    if (!qrOpen) return;
    if (account?.waStatus === "connected") {
      setQrOpen(false);
      return;
    }
    const iv = setInterval(pollQR, 15000);
    return () => clearInterval(iv);
  }, [qrOpen, account?.waStatus, pollQR]);

  const reconnect = async () => {
    await btbApi.post(`/accounts/${accountId}/reconnect`);
    fetchMeta();
  };

  const runTest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const type = file.type.startsWith("video") ? "video" : "image";
    setTest({ busy: true, type });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const { data } = await btbApi.post<any>(`/accounts/${accountId}/status-test`, fd);
      const testId = data.testId;
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = (await btbApi.get<any>(`/accounts/${accountId}/status-test/${testId}`)).data;
        if (job.status === "done") {
          setTest({ result: job.result });
          return;
        }
        if (job.status === "error") {
          setTest({ error: job.error });
          return;
        }
        if (job.status === "notfound") {
          setTest({ error: "הבדיקה אבדה (השרת אותחל?)" });
          return;
        }
      }
      setTest({ error: "הבדיקה לא הסתיימה בזמן" });
    } catch (err) {
      setTest({ error: err instanceof ApiError ? err.response.data.error || "הבדיקה נכשלה" : "הבדיקה נכשלה" });
    }
  };

  const openViewers = async (s: any) => {
    setSelStatus(s);
    setSelViewers(null);
    try {
      setSelViewers((await btbApi.get<any[]>(`/accounts/${accountId}/statuses/${s._id}/viewers`)).data);
    } catch {
      setSelViewers([]);
    }
  };

  const deleteStatus = async (s: any) => {
    const active = isStatusActive(s.postedAt);
    const msg = active
      ? "למחוק את הסטטוס? הוא עדיין פעיל — יימחק גם מוואטסאפ (delete for everyone) וגם מכאן."
      : "הסטטוס כבר פג בוואטסאפ. למחוק את הרשומה והצפיות מהמערכת?";
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      const { data } = await btbApi.del<any>(`/accounts/${accountId}/statuses/${s._id}`);
      setSelStatus(null);
      fetchDetail();
      if (data.active && !data.waDeleted) alert("הרשומה נמחקה, אך המחיקה מוואטסאפ נכשלה — ודא שהחשבון מחובר ונסה שוב.");
    } catch (err) {
      alert(err instanceof ApiError ? err.response.data.error || "שגיאה במחיקה" : "שגיאה במחיקה");
    } finally {
      setDeleting(false);
    }
  };

  if (account === undefined) return <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50">טוען…</div>;
  if (account === null)
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-50 px-6 text-center">
        <p>החשבון לא נמצא.</p>
        <button onClick={() => router.push("/btb")} className="text-sm" style={{ color: BTB.color }}>
          ← חזרה ללקוחות
        </button>
      </div>
    );

  const badge = WA_BADGE[account?.waStatus] || WA_BADGE.disconnected;
  const target = stats?.targetFollowers || account?.targetFollowers || 1000;
  const pct = stats ? Math.min(100, Math.round((stats.uniqueViewers / target) * 100)) : 0;
  const filteredStatuses = statuses.filter((s) => !statusSearch.trim() || (s.caption || "").toLowerCase().includes(statusSearch.trim().toLowerCase()));

  const navItems = [
    { id: "home", label: "בית", icon: Home },
    { id: "statuses", label: "עדכונים", icon: CircleDashed },
    { id: "audience", label: "קהל", icon: Users },
  ];
  const connected = account?.waStatus === "connected";

  return (
    <div className="h-full overflow-hidden bg-[#f0f2f5] text-[#111b21]">
      <div className="mx-auto flex h-full max-w-[1440px] bg-white shadow-sm">
        <aside className="hidden w-64 flex-none flex-col border-l border-[#e9edef] bg-white lg:flex">
          <div className="border-b border-[#e9edef] px-5 py-5">
            <button onClick={() => router.push("/btb")} className="mb-4 flex items-center gap-1 text-xs text-[#667781] hover:text-[#008069]">
              <ChevronLeft size={15} />
              כל הלקוחות
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1daa61] text-xl font-bold text-white">{account?.name?.[0] || "B"}</div>
              <div className="min-w-0">
                <p className="truncate font-bold">{account?.name}</p>
                <p dir="ltr" className="text-right text-xs text-[#667781]">
                  {account?.phone}
                </p>
              </div>
            </div>
          </div>
          <nav className="space-y-1 p-3">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${activeTab === id ? "bg-[#d9fdd3] text-[#075e54]" : "text-[#54656f] hover:bg-[#f0f2f5]"}`}
              >
                <Icon size={21} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto space-y-1 border-t border-[#e9edef] p-3">
            {connected && (
              <button onClick={() => testInput.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-[#54656f] hover:bg-[#f0f2f5]">
                <FlaskConical size={19} />
                בדיקת איכות
              </button>
            )}
            <input ref={testInput} type="file" accept="image/*,video/*" className="hidden" onChange={runTest} />
            {!connected && (
              <button onClick={openQR} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-[#54656f] hover:bg-[#f0f2f5]">
                <QrCode size={19} />
                חיבור QR
              </button>
            )}
            <button onClick={reconnect} className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-[#54656f] hover:bg-[#f0f2f5]">
              <Link2 size={19} />
              חיבור מחדש
            </button>
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-white">
          <header className="z-10 flex min-h-[76px] items-center justify-between border-b border-[#e9edef] bg-white px-4 sm:px-7">
            <div>
              <h1 className="text-2xl font-bold">{activeTab === "home" ? "BTB" : activeTab === "statuses" ? "עדכונים" : "קהל"}</h1>
              <p className="mt-0.5 text-xs text-[#667781] lg:hidden">{account?.name}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  fetchMeta();
                  fetchDetail();
                }}
                className="rounded-full p-2.5 text-[#54656f] hover:bg-[#f0f2f5]"
                aria-label="רענון"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-7 lg:pb-8">
            <div className="mx-auto max-w-4xl">
              {activeTab === "home" && (
                <>
                  <section className={`mb-6 flex items-center gap-4 rounded-2xl p-4 sm:p-5 ${connected ? "bg-[#d9fdd3]" : "bg-[#fff3d6]"}`}>
                    <div className={`flex h-12 w-12 flex-none items-center justify-center rounded-full text-white ${connected ? "bg-[#1daa61]" : "bg-[#c47b00]"}`}>{connected ? <Check size={25} /> : <WifiOff size={24} />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{connected ? "WhatsApp מחובר" : "WhatsApp לא מחובר"}</p>
                      <p className="mt-0.5 text-sm text-[#667781]">{connected ? account?.phone : "יש לחבר את החשבון כדי לפרסם סטטוסים"}</p>
                    </div>
                    <span className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:block ${badge.cls}`}>{badge.label}</span>
                  </section>
                  <h2 className="mb-3 text-xl font-bold">סקירה</h2>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="סטטוסים" value={stats?.totalStatuses ?? "—"} icon={CircleDashed} />
                    <Metric label="צופים ייחודיים" value={stats?.uniqueViewers ?? "—"} icon={Users} />
                    <Metric label="סך צפיות" value={stats?.totalViews ?? "—"} icon={Eye} />
                    <Metric label="התקדמות" value={`${pct}%`} icon={Target} />
                  </div>
                  <section className="mb-8 rounded-2xl border border-[#e9edef] p-5">
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="font-bold">התקדמות ליעד</span>
                      <span className="font-bold text-[#008069]">
                        {stats?.uniqueViewers ?? 0} / {target.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#e9edef]">
                      <div className="h-full rounded-full bg-[#1daa61] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[#667781]">{stats?.targetReached ? "היעד הושג — עבודה יפה!" : `${pct}% מהיעד`}</p>
                  </section>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xl font-bold">פעילות אחרונה</h2>
                    <button onClick={() => setActiveTab("statuses")} className="text-sm font-semibold text-[#008069]">
                      לכל העדכונים
                    </button>
                  </div>
                  <div>{statuses.length ? statuses.slice(0, 4).map((s) => <StatusCard key={s._id} s={s} onClick={() => openViewers(s)} />) : <EmptyState title="אין עדיין סטטוסים" text="הסטטוס הראשון שלך יופיע כאן" />}</div>
                </>
              )}

              {activeTab === "statuses" && (
                <>
                  <label className="mb-5 flex items-center gap-3 rounded-full bg-[#f0f2f5] px-5 py-3 text-sm text-[#667781]">
                    <Search size={18} />
                    <input value={statusSearch} onChange={(e) => setStatusSearch(e.target.value)} placeholder="חיפוש בעדכונים" className="min-w-0 flex-1 bg-transparent text-[#111b21] outline-none placeholder:text-[#667781]" />
                  </label>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">הסטטוסים שלי</h2>
                      <p className="mt-1 text-sm text-[#667781]">{statuses.length} עדכונים אחרונים</p>
                    </div>
                  </div>
                  <div>
                    {filteredStatuses.length ? (
                      filteredStatuses.map((s) => <StatusCard key={s._id} s={s} onClick={() => openViewers(s)} />)
                    ) : (
                      <EmptyState title={statuses.length ? "לא נמצאו תוצאות" : "אין סטטוסים"} text={statuses.length ? "נסו חיפוש אחר" : "לחץ על הכפתור הירוק כדי לפרסם"} />
                    )}
                  </div>
                </>
              )}

              {activeTab === "audience" && (
                <>
                  <h2 className="text-xl font-bold">גרעין העוקבים</h2>
                  <p className="mb-5 mt-1 text-sm text-[#667781]">האנשים שמעורבים הכי הרבה בסטטוסים שלך</p>
                  <div className="overflow-hidden rounded-2xl border border-[#e9edef]">
                    {viewers.length ? viewers.map((v, i) => <AudienceRow key={v.viewerJid} viewer={v} index={i} />) : <EmptyState title="אין עדיין נתוני קהל" text="לאחר צפיות בסטטוסים הקהל יופיע כאן" />}
                  </div>
                </>
              )}
            </div>
          </div>

          {connected && (
            <button
              onClick={() => setShowUpload(true)}
              className="absolute bottom-24 left-5 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1daa61] text-white shadow-lg transition hover:bg-[#168d51] hover:scale-105 lg:bottom-6 lg:left-7"
              aria-label="סטטוס חדש"
            >
              <Plus size={28} />
            </button>
          )}
          <nav className="absolute inset-x-0 bottom-0 z-10 flex border-t border-[#e9edef] bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${activeTab === id ? "text-[#075e54]" : "text-[#667781]"}`}>
                <span className={`rounded-2xl px-5 py-1 ${activeTab === id ? "bg-[#d9fdd3]" : ""}`}>
                  <Icon size={20} />
                </span>
                {label}
              </button>
            ))}
          </nav>
        </main>
      </div>

      {showUpload && (
        <StatusUploadModal
          accountId={accountId}
          onClose={() => setShowUpload(false)}
          onPosted={(r) => {
            fetchDetail();
            alert(`פורסם ${r.count} סטטוס(ים) ל-${r.recipients} אנשי קשר`);
          }}
        />
      )}

      {selStatus && (
        <Modal onClose={() => setSelStatus(null)} className="max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
              {selStatus.thumbnail ? (
                <img src={selStatus.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : selStatus.mediaType === "video" ? (
                <Video size={24} className="text-[#667781]" />
              ) : selStatus.mediaType === "image" ? (
                <ImageIcon size={24} className="text-[#667781]" />
              ) : (
                <Type size={24} className="text-[#667781]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#111b21]">צפו בסטטוס</p>
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                {fmtDate(selStatus.postedAt)} · 👁 {selStatus.viewsCount}
                <ActivePill active={isStatusActive(selStatus.postedAt)} />
              </p>
            </div>
            <button
              onClick={() => deleteStatus(selStatus)}
              disabled={deleting}
              className="flex flex-none items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={15} />
              {deleting ? "מוחק…" : "מחק סטטוס"}
            </button>
          </div>
          <ProbeReport probe={selStatus.mediaProbe} />
          <div className="max-h-80 overflow-auto -mx-2">
            {selViewers === null ? (
              <p className="p-4 text-sm text-gray-400 text-center">טוען…</p>
            ) : selViewers.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">אין צפיות מתועדות לסטטוס זה.</p>
            ) : (
              selViewers.map((v, i) => (
                <div key={v.viewerJid} className="flex items-center justify-between px-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs text-gray-300 w-5 text-center">{i + 1}</span>
                    <span dir="ltr" className={`text-sm truncate ${v.phone || v.name ? "text-[#111b21]" : "text-gray-400 italic"}`}>
                      {viewerLabel(v)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmtDate(v.viewedAt)}</span>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {test && (
        <Modal onClose={() => { if (!test.busy) setTest(null); }} className="max-w-2xl">
          <p className="font-bold text-[#111b21] mb-1">בדיקת איכות</p>
          {test.busy && (
            <div className="py-8 text-center text-sm text-gray-500">
              <div className="text-3xl mb-3 animate-pulse">🔬</div>
              מעלה לסטטוס, מוריד בחזרה ומוחק…
              <p className="text-xs text-gray-400 mt-1">{test.type === "video" ? "וידאו עשוי לקחת מספר שניות לקידוד" : ""}</p>
            </div>
          )}
          {test.error && <p className="py-6 text-sm text-red-600 text-center">{test.error}</p>}
          {test.result && (
            <>
              <p className="text-xs text-gray-400 mb-3">
                {test.result.deleted ? "✓ סטטוס הבדיקה נמחק" : "⚠ מחיקת הסטטוס נכשלה — בדוק ידנית"}
                {test.result.segmentCount > 1 && ` · נבדק מקטע 1 מתוך ${test.result.segmentCount}`}
              </p>
              {test.result.roundtripError && <p className="text-xs text-amber-600 mb-3">⚠ ההורדה בחזרה נכשלה: {test.result.roundtripError} — מוצגים מקור + נשלח בלבד.</p>}
              <ProbeReport probe={test.result.probe} />
              <button onClick={() => setTest(null)} className="w-full py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: BTB.color }}>
                סגור
              </button>
            </>
          )}
        </Modal>
      )}

      {qrOpen && (
        <Modal onClose={() => setQrOpen(false)}>
          <div className="text-center">
            <p className="text-lg font-bold mb-1 text-[#111b21]">{account?.name}</p>
            <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואטסאפ — הקוד מתרענן אוטומטית</p>
            {qrImg ? <img src={qrImg} alt="QR" className="mx-auto w-60 h-60 rounded-xl" /> : <div className="w-60 h-60 mx-auto flex items-center justify-center text-gray-400">טוען QR…</div>}
            <p className="text-xs text-[#8696a0] mt-4">וואטסאפ ← מכשירים מקושרים ← קשר מכשיר</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
