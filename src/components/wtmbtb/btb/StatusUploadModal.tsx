"use client";
// Port of Whatsapp/client/src/components/btb/StatusUploadModal.jsx
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useState, useEffect } from "react";
import { btbApi } from "@/lib/wtmbtb/api";
import { Image as ImageIcon, Video, Type, Upload, Send, Users, Check, X } from "lucide-react";

const BG_COLORS = ["#1F3A5F", "#075E54", "#B23A48", "#6D28D9", "#0F766E", "#B45309", "#111827"];
const SEGMENT_SECONDS = 30;
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const TYPES = [
  { id: "image", label: "תמונה" },
  { id: "video", label: "ווידאו" },
  { id: "text", label: "טקסט" },
];

export default function StatusUploadModal({ accountId, onClose, onPosted }: { accountId: string; onClose: () => void; onPosted?: (r: any) => void }) {
  const [type, setType] = useState("image");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPrev] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [duration, setDur] = useState(0);
  const [videoQuality, setVideoQuality] = useState("max");
  const [audience, setAud] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    btbApi
      .get<any>(`/accounts/${accountId}/audience`)
      .then((r) => setAud(r.data.count))
      .catch(() => setAud(0));
  }, [accountId]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPrev(URL.createObjectURL(f));
    setDur(0);
  };

  const switchType = (t: string) => {
    setType(t);
    setFile(null);
    setDur(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPrev(null);
    }
  };

  const segments = duration ? Math.max(1, Math.ceil(duration / SEGMENT_SECONDS)) : 0;
  const canSubmit = (type === "text" ? text.trim() : !!file) && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      if (type === "video") fd.append("videoQuality", videoQuality);
      if (type === "text") {
        fd.append("caption", text);
        fd.append("bgColor", bgColor);
      } else {
        fd.append("file", file as File);
        fd.append("caption", caption);
      }
      const { data } = await btbApi.post<any>(`/accounts/${accountId}/status`, fd);
      const jobId = data.jobId;
      const deadline = Date.now() + 600_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const job = (await btbApi.get<any>(`/accounts/${accountId}/status-job/${jobId}`)).data;
        if (job.status === "done") {
          onPosted?.(job.result);
          onClose();
          return;
        }
        if (job.status === "error") throw new Error(job.error);
        if (job.status === "notfound") throw new Error("ההעלאה אבדה (השרת אותחל?)");
      }
      throw new Error("ההעלאה לוקחת יותר מדי זמן — נסה סרטון קצר/קל יותר");
    } catch (err: any) {
      alert(err.message || "שגיאה בהעלאת הסטטוס");
    } finally {
      setBusy(false);
    }
  };

  const TypeIcon = type === "image" ? ImageIcon : type === "video" ? Video : Type;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b141a]/90 sm:p-5" onClick={() => !busy && onClose()}>
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-[#e9edef] px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-[#111b21]">סטטוס חדש</h2>
            <p className="text-xs text-[#667781]">בחרו תוכן, בדקו ושלחו</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-full p-2 text-[#54656f] hover:bg-[#f0f2f5] disabled:opacity-40">
            <X size={23} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(280px,1fr)_360px] md:overflow-hidden">
          <div className="flex min-h-[320px] items-center justify-center bg-[#0b141a] p-4 sm:min-h-[480px]">
            <div className="relative flex h-full max-h-[65vh] w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-[#111b21]" style={{ aspectRatio: "9 / 16" }}>
              {type === "text" ? (
                <div className="flex h-full w-full items-center justify-center break-words p-7 text-center text-2xl font-semibold text-white" style={{ backgroundColor: bgColor }}>
                  {text || "כתבו סטטוס"}
                </div>
              ) : !previewUrl ? (
                <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 text-[#b9c2c7]">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                    <Upload size={30} />
                  </span>
                  <span className="font-semibold">בחירת {type === "image" ? "תמונה" : "וידאו"}</span>
                  <span className="text-xs">לחצו לבחירה מהמכשיר</span>
                  <input type="file" accept={type === "image" ? "image/*" : "video/*"} onChange={onFile} className="hidden" />
                </label>
              ) : type === "image" ? (
                <img src={previewUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <video src={previewUrl} className="h-full w-full object-contain" controls onLoadedMetadata={(e) => setDur((e.target as HTMLVideoElement).duration || 0)} />
              )}
              {caption && type !== "text" && <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-sm text-white">{caption}</div>}
            </div>
          </div>

          <div className="p-5 sm:p-6 md:overflow-y-auto">
            <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-[#f0f2f5] p-1.5">
              {TYPES.map((t) => {
                const Icon = t.id === "image" ? ImageIcon : t.id === "video" ? Video : Type;
                return (
                  <button
                    key={t.id}
                    onClick={() => switchType(t.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${type === t.id ? "bg-white text-[#075e54] shadow-sm" : "text-[#667781]"}`}
                  >
                    <Icon size={17} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d9fdd3] text-[#075e54]">
                <TypeIcon size={20} />
              </span>
              <div>
                <p className="font-bold text-[#111b21]">{type === "text" ? "סטטוס טקסט" : type === "video" ? "וידאו לסטטוס" : "תמונה לסטטוס"}</p>
                <p className="text-xs text-[#667781]">התצוגה משמאל היא מה שיפורסם</p>
              </div>
            </div>

            {type === "text" ? (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="מה תרצו לשתף?"
                  className="mb-4 w-full resize-none rounded-2xl border border-[#dfe3e5] p-3 text-sm outline-none focus:border-[#1daa61] focus:ring-2 focus:ring-[#1daa61]/15"
                />
                <p className="mb-2 text-xs font-semibold text-[#667781]">צבע רקע</p>
                <div className="mb-5 flex flex-wrap gap-2">
                  {BG_COLORS.map((c) => (
                    <button key={c} onClick={() => setBgColor(c)} className={`h-8 w-8 rounded-full transition ${bgColor === c ? "ring-2 ring-[#111b21] ring-offset-2" : ""}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </>
            ) : (
              previewUrl && (
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="הוספת כיתוב…"
                  className="mb-5 w-full rounded-2xl border border-[#dfe3e5] px-4 py-3 text-sm outline-none focus:border-[#1daa61] focus:ring-2 focus:ring-[#1daa61]/15"
                />
              )
            )}

            {type === "video" && previewUrl && (
              <>
                <p className="mb-3 text-xs text-[#667781]">{duration ? `אורך ${fmtSec(duration)} · ${segments} סטטוסים של עד 30 שניות` : "טוען פרטי וידאו…"}</p>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  {[
                    ["max", "איכות מרבית", "הכי קרוב למקור"],
                    ["optimized", "חיסכון חכם", "קטן יותר, עדיין חד"],
                  ].map(([id, title, sub]) => (
                    <button key={id} onClick={() => setVideoQuality(id)} className={`relative rounded-2xl border p-3 text-right ${videoQuality === id ? "border-[#1daa61] bg-[#e9f8ef]" : "border-[#e1e5e7]"}`}>
                      {videoQuality === id && <Check size={15} className="absolute left-2 top-2 text-[#008069]" />}
                      <span className="block text-sm font-bold">{title}</span>
                      <span className="mt-1 block text-[11px] text-[#667781]">{sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mt-auto flex items-center gap-2 rounded-2xl bg-[#f7f8fa] p-3 text-xs text-[#667781]">
              <Users size={17} className="text-[#1daa61]" />
              {audience === null ? "בודק נמענים…" : `יישלח ל־${audience.toLocaleString()} אנשי קשר`}
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1daa61] py-3.5 font-bold text-white transition hover:bg-[#168d51] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  מפרסם…
                </>
              ) : (
                <>
                  <Send size={19} />
                  פרסום לסטטוס
                </>
              )}
            </button>
            {busy && type === "video" && <p className="mt-2 text-center text-xs text-[#8696a0]">מקודד, חותך ומפרסם — אפשר להשאיר את החלון פתוח</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
