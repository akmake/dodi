/**
 * Centralized environment configuration.
 *
 * All env access goes through here so it is read (and cleaned) in one place.
 * `clean()` strips the U+FEFF BOM that Windows injects into copied values
 * (this previously broke the Groq API key) and trims whitespace.
 */

function clean(value: string | undefined): string {
  return (value ?? "")
    .split("")
    .filter((c) => c.charCodeAt(0) !== 0xfeff)
    .join("")
    .trim();
}

export const config = {
  env: process.env.NODE_ENV ?? "development",

  mongo: {
    uri: clean(process.env.MONGODB_URI),
    dbName: clean(process.env.MONGODB_DB) || "bootwhat",
  },

  whatsapp: {
    apiVersion: clean(process.env.WHATSAPP_API_VERSION) || "v21.0",
    token: clean(process.env.WHATSAPP_TOKEN),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    /** WABA id — required for template management (§19). */
    wabaId: clean(process.env.WHATSAPP_WABA_ID),
    verifyToken: clean(process.env.WEBHOOK_VERIFY_TOKEN),
    /** Meta App Secret — required to verify the X-Hub-Signature-256 webhook signature. */
    appSecret: clean(process.env.WHATSAPP_APP_SECRET),
  },

  groq: {
    apiKey: clean(process.env.GROQ_API_KEY),
    model: clean(process.env.GROQ_MODEL) || "llama-3.3-70b-versatile",
    fallbackModel: "llama-3.1-8b-instant",
  },

  anthropic: {
    apiKey: clean(process.env.ANTHROPIC_API_KEY),
    /** Latest Claude (IMPLEMENTATION.md §2). Override per env to switch tier (e.g. claude-haiku-4-5 for cost). */
    model: clean(process.env.ANTHROPIC_MODEL) || "claude-opus-4-8",
    /** Reply-path reasoning depth: low | medium | high | max. Low keeps WhatsApp replies fast and cheap. */
    effort: (clean(process.env.ANTHROPIC_EFFORT) || "low") as "low" | "medium" | "high" | "max",
  },

  /** Self-hosted LLM (Ollama / vLLM / llama.cpp — anything speaking the OpenAI /chat/completions shape).
   *  Runs entirely on your own hardware: no external API, no per-token cost, no vendor dependency. */
  local: {
    baseUrl: clean(process.env.LOCAL_AI_URL) || "http://localhost:11434/v1",
    model: clean(process.env.LOCAL_AI_MODEL) || "qwen2.5:3b",
    /** Ollama ignores the key but the OpenAI client shape requires one; vLLM/TGI may enforce it. */
    apiKey: clean(process.env.LOCAL_AI_KEY) || "ollama",
  },

  /** AI backend: "anthropic" | "groq" | "local". Empty → Anthropic when its key is set, else Groq (legacy). */
  aiProvider: clean(process.env.AI_PROVIDER),

  /** Shared secret the cron caller sends (x-cron-secret) to drain the job queue (C1). */
  cronSecret: clean(process.env.CRON_SECRET),

  jobs: {
    /**
     * Self-drain interval (ms) for the job queue on a long-lived server (PM2/VPS),
     * where no external cron hits `/api/jobs/drain` — without it flow timeouts,
     * delays, campaigns and follow-ups never fire. Default 60s; set `0` to disable
     * (e.g. on Vercel, where vercel.json's cron does the draining).
     */
    drainIntervalMs: (() => {
      const raw = clean(process.env.JOBS_DRAIN_INTERVAL_MS);
      if (raw === "") return 60_000;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 60_000;
    })(),
  },

  /** Embeddings for vector KB retrieval ([קטגוריה 12] A3). Without a key, retrieval falls back to lexical. */
  embeddings: {
    voyageApiKey: clean(process.env.VOYAGE_API_KEY),
    model: clean(process.env.VOYAGE_MODEL) || "voyage-3.5",
  },

  /** Key for encrypting secrets at rest (WhatsApp access tokens). Derived to a 32-byte key; AES-256-GCM. Optional in dev. */
  encryptionKey: clean(process.env.ENCRYPTION_KEY),

  /** WRE geocoding fallback (see src/modules/wre/geo/). govmap needs no key; Google is the backup provider. */
  geocoding: {
    googleApiKey: clean(process.env.GOOGLE_GEOCODING_API_KEY),
  },

  /**
   * Until multi-tenant onboarding exists, every request resolves to this tenant.
   * The data layer is already tenant-scoped, so flipping to real resolution
   * (by incoming phone_number_id) later requires no model changes.
   */
  defaultTenantId: clean(process.env.DEFAULT_TENANT_ID) || "default",
} as const;

export type AppConfig = typeof config;
