/**
 * Guardrails — [קטגוריה 10] §10.5 / [קטגוריה 24] §24.2.
 *
 * A last check before any AI reply leaves the system: forbidden phrases/topics
 * and a basic length cap. Returns whether to allow the text and the violations
 * found, so the caller can block + escalate instead of sending something unsafe.
 *
 * MVP policy is a built-in default set; the seam (`GuardrailPolicy`) is ready for
 * per-tenant config later.
 */

export interface GuardrailPolicy {
  /** Phrases the bot must never say (regex sources, case-insensitive). */
  forbiddenPhrases: string[];
  /** Hard length cap for a single reply. */
  maxChars: number;
}

const DEFAULT_POLICY: GuardrailPolicy = {
  forbiddenPhrases: [
    // Promises/financial/medical/legal commitments a service bot must not make.
    "מובטח החזר",
    "אני רופא",
    "ייעוץ משפטי",
    "guaranteed refund",
    "as your doctor",
    "legal advice",
  ],
  maxChars: 4000,
};

export interface GuardrailResult {
  allowed: boolean;
  violations: string[];
}

export function checkOutput(text: string, policy: GuardrailPolicy = DEFAULT_POLICY): GuardrailResult {
  const violations: string[] = [];
  const lower = text.toLowerCase();
  for (const phrase of policy.forbiddenPhrases) {
    if (lower.includes(phrase.toLowerCase())) violations.push(phrase);
  }
  if (text.length > policy.maxChars) violations.push(`length>${policy.maxChars}`);
  return { allowed: violations.length === 0, violations };
}
