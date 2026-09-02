/**
 * AI tool-calling bridge — [קטגוריה 13 → 10] A4.
 *
 * Exposes the tenant's enabled Business Actions ([13]) as Claude tools and wires
 * a tool executor that runs them through the Actions service (with confirmation,
 * idempotency and audit intact). This is what lets the AI *do* work, not just
 * answer.
 */
import type { ToolSpec, ToolCall } from "./provider";
import { listActions, execute } from "@/modules/actions";
import { buildDataTools, isDataTool, executeDataTool } from "./data-tools";

const GENERIC_SCHEMA = {
  type: "object" as const,
  properties: {},
  additionalProperties: true,
};

/**
 * Build Claude tool specs from the tenant's enabled actions. When a skill is
 * active, restrict the toolset to that skill's allowed actions ([קטגוריה 11]).
 */
export async function buildActionTools(
  tenantId: string,
  allowedActionIds?: string[]
): Promise<ToolSpec[]> {
  let actions = await listActions(tenantId);
  if (allowedActionIds && allowedActionIds.length > 0) {
    const allow = new Set(allowedActionIds);
    actions = actions.filter((a) => allow.has(a.id));
  }
  const actionTools = actions.map((a) => ({
    name: a.name,
    description: a.description || a.name,
    inputSchema:
      a.inputSchema && typeof a.inputSchema === "object"
        ? (a.inputSchema as ToolSpec["inputSchema"])
        : GENERIC_SCHEMA,
  }));

  // Data-platform tools ([28]) are exposed live from the table schemas. When a
  // skill restricts the toolset (allowedActionIds passed), the agent runs scoped
  // to those actions only — so we keep data tools out of that narrowed set.
  if (allowedActionIds && allowedActionIds.length > 0) return actionTools;
  const dataTools = await buildDataTools(tenantId);
  return [...actionTools, ...dataTools];
}

/**
 * Returns an executor that maps a tool call to an Action run. Confirmation-gated
 * actions return a pending notice rather than executing — the human/flow confirms.
 */
export function makeActionExecutor(tenantId: string, conversationId?: string) {
  return async (call: ToolCall): Promise<string> => {
    // Data-platform tools ([28]) run through the shared builtin path.
    if (isDataTool(call.name)) return executeDataTool(tenantId, call);

    const actions = await listActions(tenantId);
    const action = actions.find((a) => a.name === call.name);
    if (!action) return `error: unknown action "${call.name}"`;

    const run = await execute(tenantId, action.id, call.input, {
      conversationId,
      idempotencyKey: `${conversationId ?? "ai"}:${call.name}:${JSON.stringify(call.input)}`,
    });

    if (run.status === "pending_confirmation") {
      return "This action requires confirmation before it runs; a human will approve it.";
    }
    if (run.status === "failed") return `error: ${String(run.error)}`;
    return typeof run.output === "string" ? run.output : JSON.stringify(run.output ?? {});
  };
}
