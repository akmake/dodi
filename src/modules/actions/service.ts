/**
 * Actions service — [קטגוריה 13].
 *
 * Registers and executes tools. HTTP/webhook targets call out with templated
 * params; `requires_confirmation` parks a run as pending; idempotency keys guard
 * double-submit; every run is recorded and audited (§13.1).
 */
import { writeAudit } from "@/modules/admin/service";
import type { Action, ActionRun, ActionTargetType } from "./models";
import { ActionRepository, ActionRunRepository, ensureActionIndexes } from "./repository";
import { runBuiltin } from "./builtins";

const actions = new ActionRepository();
const runs = new ActionRunRepository();

export interface RegisterActionInput {
  name: string;
  description: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  target: { type: ActionTargetType; config: Record<string, unknown> };
  requiresConfirmation?: boolean;
  allowedInSkills?: string[];
}

export async function registerAction(tenantId: string, input: RegisterActionInput): Promise<Action> {
  await ensureActionIndexes();
  const existing = await actions.findByName(tenantId, input.name);
  const data = {
    description: input.description,
    inputSchema: input.inputSchema ?? null,
    outputSchema: input.outputSchema ?? null,
    target: input.target,
    requiresConfirmation: input.requiresConfirmation ?? false,
    allowedInSkills: input.allowedInSkills ?? [],
    enabled: true,
  };
  if (existing) return (await actions.update(tenantId, existing.id, data)) ?? existing;
  return actions.create(tenantId, { name: input.name, ...data });
}

export function listActions(tenantId: string) {
  return actions.listEnabled(tenantId);
}

export interface ExecuteOptions {
  conversationId?: string;
  idempotencyKey?: string;
  confirmed?: boolean;
  actorId?: string;
}

/** Execute an action by id, returning the recorded run. */
export async function execute(
  tenantId: string,
  actionId: string,
  input: Record<string, unknown>,
  opts: ExecuteOptions = {}
): Promise<ActionRun> {
  await ensureActionIndexes();

  // Idempotency: return the prior successful run if any.
  if (opts.idempotencyKey) {
    const prior = await runs.findByIdempotencyKey(tenantId, opts.idempotencyKey);
    if (prior && prior.status === "success") return prior;
  }

  const action = await actions.findById(tenantId, actionId);
  if (!action || !action.enabled) throw new Error("action not found or disabled");

  // Confirmation gate for sensitive actions (§13.1).
  if (action.requiresConfirmation && !opts.confirmed) {
    return runs.create(tenantId, {
      actionId,
      conversationId: opts.conversationId ?? null,
      input,
      output: null,
      status: "pending_confirmation",
      error: null,
      idempotencyKey: opts.idempotencyKey ?? null,
    });
  }

  let output: unknown = null;
  let error: unknown = null;
  let status: ActionRun["status"] = "success";
  try {
    output = await runTarget(action, input);
  } catch (err) {
    status = "failed";
    error = String(err);
  }

  const run = await runs.create(tenantId, {
    actionId,
    conversationId: opts.conversationId ?? null,
    input,
    output,
    status,
    error,
    idempotencyKey: opts.idempotencyKey ?? null,
  });

  await writeAudit(tenantId, {
    actorId: opts.actorId ?? null,
    action: `action.${action.name}`,
    targetType: "action_run",
    targetId: run.id,
    after: { status, input },
  });

  return run;
}

async function runTarget(action: Action, input: Record<string, unknown>): Promise<unknown> {
  const { type, config } = action.target;
  switch (type) {
    case "http":
    case "webhook": {
      const url = template(String(config.url ?? ""), input);
      const method = (config.method as string) ?? (type === "webhook" ? "POST" : "GET");
      const headers = { "Content-Type": "application/json", ...(config.headers as object) };
      const hasBody = method !== "GET" && method !== "HEAD";
      const body = hasBody
        ? template(JSON.stringify(config.bodyTemplate ?? input), input)
        : undefined;
      const res = await fetch(url, { method, headers, body });
      const text = await res.text();
      const json = safeJson(text);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return json ?? text;
    }
    case "builtin":
      // Built-in catalog (data platform, appointments, tickets…) plugs in here (§13.2).
      return runBuiltin(action.tenantId, String(config.builtin ?? ""), config, input);
    case "integration":
      throw new Error("integration targets not implemented");
    default:
      throw new Error(`unknown target type: ${type}`);
  }
}

/** Replace {{input.x}} / {{x}} tokens with values from `input`. */
function template(str: string, input: Record<string, unknown>): string {
  return str.replace(/\{\{\s*(?:input\.)?([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const val = key.split(".").reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), input);
    return val == null ? "" : String(val);
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export { ensureActionIndexes };
