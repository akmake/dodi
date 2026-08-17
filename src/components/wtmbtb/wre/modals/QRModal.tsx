"use client";
import { useState, useEffect, useRef } from "react";
import Modal from "@/components/wtmbtb/ui/Modal";
import { wreApi, ApiError } from "@/lib/wtmbtb/api";

/** Poll gap. The route itself holds up to ~8s when there's no code yet, so this
 *  only paces the refresh once codes are flowing. */
const POLL_MS = 2000;

const STATUS_TEXT: Record<string, string> = {
  connecting: "מתחבר...",
  waiting_qr: "סרוק את הקוד",
  connected: "מחובר!",
  disconnected: "מנותק — מנסה שוב...",
};

/**
 * Live pairing modal.
 *
 * WhatsApp invalidates the pairing QR every ~20s. A snapshot fetched once goes
 * stale before most people finish opening the app on their phone, and scanning
 * it silently fails — so this keeps pulling the current code and swaps it in.
 * It also watches for the socket going `connected` and closes itself, since the
 * engine drops the QR on success and there'd otherwise be nothing to scan.
 */
export default function QRModal({
  clientId,
  name,
  onClose,
  onConnected,
}: {
  clientId: string;
  name: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");

  // Kept in refs so the poll loop never restarts when the parent re-renders and
  // hands down new callback identities — a restart would drop the in-flight
  // request and stutter the refresh.
  const onConnectedRef = useRef(onConnected);
  const onCloseRef = useRef(onClose);
  onConnectedRef.current = onConnected;
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await wreApi.get<{ status: string; qr: string | null }>(`/clients/${clientId}/qr`);
        if (!alive) return;

        setError("");
        setStatus(res.data.status);
        setQr(res.data.qr);

        if (res.data.status === "connected") {
          onConnectedRef.current();
          onCloseRef.current();
          return; // stop polling
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError ? err.response.data.error || "שגיאת חיבור" : "שגיאת חיבור");
      }
      if (alive) timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [clientId]);

  return (
    <Modal onClose={onClose}>
      <div className="text-center">
        <p className="text-lg font-bold mb-1 text-[#111b21]">{name}</p>
        <p className="text-sm text-[#8696a0] mb-4">{STATUS_TEXT[status] ?? status}</p>

        <div className="relative mx-auto w-60 h-60 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" className="w-full h-full" />
          ) : (
            <div className="text-center px-6">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">{error ? error : "ממתין לקוד מהוואטסאפ..."}</p>
            </div>
          )}
        </div>

        {qr && (
          <p className="text-[11px] text-emerald-600 mt-2 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            הקוד מתרענן אוטומטית
          </p>
        )}

        <p className="text-xs text-[#8696a0] mt-3 leading-relaxed">
          וואטסאפ ← מכשירים מקושרים ← קשר מכשיר
          <br />
          החלון ייסגר לבד ברגע שהחיבור יצליח.
        </p>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </Modal>
  );
}
