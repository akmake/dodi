/**
 * Sandboxed JS execution for the flow `run_code` node ([קטגוריה 8] Run code).
 *
 * Runs tenant-authored code inside an `isolated-vm` Isolate — a true V8 isolate
 * with its own heap, hard memory cap, and wall-clock timeout. The code sees only
 * a deep COPY of the run `state` and `input`; it cannot reach Node globals, the
 * filesystem, network, or this process's memory. The user `return`s a value,
 * which is copied back out and written to the run state.
 *
 * `isolated-vm` is a native module and is imported lazily, so an environment
 * where it isn't installed (e.g. a constrained serverless runtime) degrades to a
 * clean `sandbox_unavailable` error and the node's "error" branch, rather than
 * crashing the engine at import time.
 */

export interface SandboxResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_MEMORY_MB = 16;

export async function runUserCode(
  code: string,
  context: { state: Record<string, unknown>; input?: { text?: string; buttonReplyId?: string } },
  opts: { timeoutMs?: number; memoryMb?: number } = {}
): Promise<SandboxResult> {
  let ivm: typeof import("isolated-vm");
  try {
    ivm = await import("isolated-vm");
  } catch {
    return { ok: false, error: "sandbox_unavailable" };
  }

  const isolate = new ivm.Isolate({ memoryLimit: opts.memoryMb ?? DEFAULT_MEMORY_MB });
  try {
    const ctx = await isolate.createContext();
    const jail = ctx.global;
    // Inject deep copies — the sandbox can read state/input but never the live objects.
    await jail.set("state", new ivm.ExternalCopy(context.state ?? {}).copyInto());
    await jail.set("input", new ivm.ExternalCopy(context.input ?? {}).copyInto());

    // Wrap so the user can simply `return <value>` from their snippet.
    const script = await isolate.compileScript(`(function(){ "use strict";\n${code}\n})()`);
    const value = await script.run(ctx, { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, copy: true });
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    isolate.dispose();
  }
}
