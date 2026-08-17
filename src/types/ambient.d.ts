/**
 * Ambient module shims.
 *
 * `isolated-vm` is an optional native dependency used only by the flow `run_code`
 * node (src/modules/flows/sandbox.ts), which imports it lazily inside a
 * try/catch and degrades to `sandbox_unavailable` when it's missing. Declaring
 * it here keeps `tsc`/`next build` from failing in environments where the native
 * module isn't installed (e.g. Windows dev, or a serverless runtime that can't
 * build it) — the runtime behavior is unchanged.
 */
declare module "isolated-vm";
