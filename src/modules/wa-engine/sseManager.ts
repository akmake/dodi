/**
 * Live-update broadcast (SSE) — port of `Whatsapp/server/services/sseManager.js`.
 *
 * One process-wide set of open `ServerResponse`-like writers. WTM/BTB screens
 * subscribe once per tab and get a `broadcast(event)` push whenever pool state,
 * messages, or status views change — same wire format as the legacy client
 * expects (`event: update\ndata: {"event": "..."}\n\n`), so the ported UI needs
 * no protocol changes.
 */
export interface SseWritable {
  write(chunk: string): unknown;
}

const clients = new Set<SseWritable>();

export function addSseClient(client: SseWritable): () => void {
  client.write(":\n\n"); // initial comment to flush headers
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcast(event: string): void {
  if (clients.size === 0) return;
  const payload = `event: update\ndata: ${JSON.stringify({ event })}\n\n`;
  for (const client of [...clients]) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// Keep connections alive — browsers close idle SSE after ~60s.
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
export function startSseKeepAlive(): void {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    for (const client of [...clients]) {
      try {
        client.write(":\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 25_000);
  keepAliveTimer.unref?.();
}
