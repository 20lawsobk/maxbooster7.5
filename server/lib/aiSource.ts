/**
 * MaxCore AI source contract.
 *
 * MaxCore (the external always-on server) is the single, primary, and ONLY
 * source for every Max Booster AI feature — the sole exception being "Max",
 * the in-app assistant, which answers from its local knowledge base.
 *
 * When MaxCore cannot fulfil a request it returns null. Converted features must
 * NOT silently substitute local ML / rule-engine output; instead they surface
 * an explicit failure via `requireMaxCore()` (request paths → 503; background
 * jobs → caught by their own try/catch, logged, and skipped — never fabricated).
 */

import { AppError } from "../middleware/errorHandler.js";

/**
 * Thrown when a MaxCore AI feature cannot be fulfilled by the remote server.
 * Operational, maps to HTTP 503 in the global error handler.
 */
export class AIUnavailableError extends AppError {
  constructor(feature: string) {
    super(
      `AI service temporarily unavailable (${feature}). Please try again in a moment.`,
      503,
      true,
      "AI_UNAVAILABLE",
      { feature },
    );
    this.name = "AIUnavailableError";
    Object.setPrototypeOf(this, AIUnavailableError.prototype);
  }
}

/**
 * Require a non-null MaxCore result. Throws {@link AIUnavailableError} when
 * MaxCore returned nothing, guaranteeing no local fallback can silently take
 * over as the source of an AI feature's output.
 *
 * @param value   the raw MaxCore result (`null`/`undefined` means unavailable)
 * @param feature short human-readable feature name for the error message/logs
 */
export function requireMaxCore<T>(
  value: T | null | undefined,
  feature: string,
): T {
  if (value === null || value === undefined) {
    throw new AIUnavailableError(feature);
  }
  return value;
}
