"use client";
/**
 * Fetch-based drop-in for the original Vite client's axios `api`
 * (`Whatsapp/client/src/services/api.js`), so the ported WTM/BTB pages keep
 * their `api.get(...).data` / `api.post(...)` call sites almost verbatim.
 *
 * Two instances, one per unified product's API namespace:
 *   wtmApi → /api/wtm      (was the original server's /api/tenants,/dashboard,/logs,/audit)
 *   btbApi → /api/btb      (was the original server's /api/btb)
 *
 * On 401 it redirects to /login, exactly like the original interceptor.
 * Returns `{ data, headers }` so `res.data` and `res.headers['...']` both work.
 */

export interface ApiResponse<T = unknown> {
  data: T;
  headers: Headers;
}

interface RequestOpts {
  /** Array values are repeated (`?k=a&k=b`) so the server can read them with `searchParams.getAll`. */
  params?: Record<string, string | number | string[] | undefined>;
  headers?: Record<string, string>;
  responseType?: "json" | "blob";
}

function buildUrl(base: string, path: string, params?: RequestOpts["params"]): string {
  let url = base + path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      // `set(k, String(["a","b"]))` would emit a single "a,b" value, which
      // `getAll` then reads as one bogus entry. Repeat the key instead.
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
      else qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  return url;
}

async function handle<T>(res: Response, responseType: "json" | "blob"): Promise<ApiResponse<T>> {
  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, "unauthorized");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-json error */
    }
    throw new ApiError(res.status, (body as { error?: string })?.error, body);
  }
  const data = (responseType === "blob" ? await res.blob() : await res.json().catch(() => ({}))) as T;
  return { data, headers: res.headers };
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  /** Mirrors axios' `err.response.data.error` access used across the ported pages. */
  response: { status: number; data: { error?: string } };
  constructor(status: number, error?: string, body?: unknown) {
    super(error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
    this.response = { status, data: { error } };
  }
}

function makeClient(base: string) {
  const isFormData = (b: unknown): b is FormData => typeof FormData !== "undefined" && b instanceof FormData;

  const jsonHeaders = (extra?: Record<string, string>) => ({ "Content-Type": "application/json", ...extra });

  return {
    get: async <T = unknown>(path: string, opts: RequestOpts = {}): Promise<ApiResponse<T>> => {
      const res = await fetch(buildUrl(base, path, opts.params), { credentials: "include", headers: opts.headers });
      return handle<T>(res, opts.responseType ?? "json");
    },
    post: async <T = unknown>(path: string, body?: unknown, opts: RequestOpts = {}): Promise<ApiResponse<T>> => {
      const form = isFormData(body);
      const res = await fetch(buildUrl(base, path, opts.params), {
        method: "POST",
        credentials: "include",
        headers: form ? opts.headers : jsonHeaders(opts.headers),
        body: form ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });
      return handle<T>(res, opts.responseType ?? "json");
    },
    put: async <T = unknown>(path: string, body?: unknown, opts: RequestOpts = {}): Promise<ApiResponse<T>> => {
      const res = await fetch(buildUrl(base, path, opts.params), {
        method: "PUT",
        credentials: "include",
        headers: jsonHeaders(opts.headers),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return handle<T>(res, opts.responseType ?? "json");
    },
    del: async <T = unknown>(path: string, opts: RequestOpts = {}): Promise<ApiResponse<T>> => {
      const res = await fetch(buildUrl(base, path, opts.params), { method: "DELETE", credentials: "include", headers: opts.headers });
      return handle<T>(res, opts.responseType ?? "json");
    },
  };
}

export const wtmApi = makeClient("/api/wtm");
export const btbApi = makeClient("/api/btb");
export const wtaApi = makeClient("/api/wta");
export const wreApi = makeClient("/api/wre");
