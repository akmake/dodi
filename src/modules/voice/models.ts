/**
 * Voice / Contact Center models — [קטגוריה 26].
 *
 * Foundation for telephony as a first-class channel: a tenant builds an IVR flow
 * (a small node graph), and inbound calls walk it — playing prompts, gathering
 * DTMF, routing to an agent/team, taking voicemail, or handing to the voice bot.
 * The actual carrier (Twilio/Vonage/…) plugs in behind `TelephonyAdapter`; this
 * module owns the flow, the call session and the transcript.
 *
 * Collections: `ivr_flows`, `call_sessions`.
 */
import type { BaseEntity } from "@/core/types";

export type IvrAction =
  | "play" // speak a prompt then advance to `nextId`
  | "menu" // speak, then gather one digit and branch via `options`
  | "dial_agent"
  | "dial_team"
  | "voicebot" // hand the call to the AI voice agent
  | "voicemail"
  | "hangup";

export interface IvrOption {
  digit: string;
  nextId: string;
}

export interface IvrNode {
  id: string;
  action: IvrAction;
  /** TTS text spoken at this node. */
  prompt?: string;
  /** Branches for a `menu` node. */
  options?: IvrOption[];
  /** Where to advance for non-branching nodes. */
  nextId?: string;
  /** agentId / teamId for dial_* nodes. */
  target?: string;
}

export interface IvrFlow extends BaseEntity {
  name: string;
  /** Spoken once at the start of the call. */
  greeting: string;
  nodes: IvrNode[];
  rootNodeId: string | null;
  enabled: boolean;
}

export type CallStatus =
  | "ringing"
  | "in_ivr"
  | "in_queue"
  | "connected"
  | "voicemail"
  | "completed"
  | "failed";

export interface CallSession extends BaseEntity {
  /** Carrier-side call id. */
  externalCallId: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  status: CallStatus;
  flowId: string | null;
  currentNodeId: string | null;
  assignedAgentId: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

// ── Provider-agnostic voice instructions ───────────────────────────────────────
/**
 * A carrier-neutral instruction the telephony webhook translates to the provider
 * markup (e.g. TwiML). Keeping the engine in these verbs means swapping carriers
 * is an adapter change, not an engine rewrite.
 */
export type VoiceInstruction =
  | { verb: "say"; text: string }
  | { verb: "gather"; prompt: string; numDigits: number; timeoutSec: number }
  | { verb: "dial"; target: string; kind: "agent" | "team" }
  | { verb: "record"; prompt: string }
  | { verb: "hangup" };
