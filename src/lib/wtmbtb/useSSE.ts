"use client";
/**
 * Live-update hook — port of `Whatsapp/client/src/hooks/useSSE.js`.
 * Points at `/api/wtm/events` (the unified engine's shared broadcast stream —
 * emits `wa_status` / `message` / `btb_status`). EventSource auto-reconnects.
 */
import { useEffect, useRef } from "react";

export function useSSE(callback: () => void, debounceMs = 300): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const debounced = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(), debounceMs);
    };

    const es = new EventSource("/api/wtm/events", { withCredentials: true });
    es.addEventListener("update", debounced);
    es.onerror = () => {};

    return () => {
      es.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [debounceMs]);
}
