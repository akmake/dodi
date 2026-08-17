"use client";
/**
 * Client hook for the current user's access profile (from /api/auth/me).
 * Used by the service switcher + "בחר שירות" screen to show only what's allowed.
 */
import { useEffect, useState } from "react";
import type { ServiceId } from "@/modules/admin/models";

export interface Access {
  loading: boolean;
  isAdmin: boolean;
  allowedServices: ServiceId[];
}

export function useAccess(): Access {
  const [state, setState] = useState<Access>({ loading: true, isAdmin: false, allowedServices: [] });

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setState({ loading: false, isAdmin: !!j?.isAdmin, allowedServices: (j?.allowedServices ?? []) as ServiceId[] });
      })
      .catch(() => alive && setState({ loading: false, isAdmin: false, allowedServices: [] }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
