export interface SubscriptionSetupError {
  message: string;
  code?: string;
  retryable?: boolean;
}

export type SubscriptionAuthAction =
  | { kind: "wait" }
  | { kind: "redirect"; href: string }
  | { kind: "continue" };

export type SubscriptionSetupPayloadResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: SubscriptionSetupError };

export const SUBSCRIPTION_BODY_TIMEOUT_MS = 10_000;

export function getSubscriptionAuthAction(input: {
  authLoading: boolean;
  userId?: string | null;
  tier?: string;
}): SubscriptionAuthAction {
  if (input.authLoading) return { kind: "wait" };
  if (input.userId) return { kind: "continue" };

  const destination = input.tier
    ? `/subscribe/${encodeURIComponent(input.tier)}`
    : "/pricing";
  return {
    kind: "redirect",
    href: `/login?redirect=${encodeURIComponent(destination)}`,
  };
}

export async function readSubscriptionSetupPayload(
  response: Pick<Response, "json">,
  timeoutMs: number = SUBSCRIPTION_BODY_TIMEOUT_MS,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            "The checkout response took too long to finish loading.",
          ) as Error & { code?: string; retryable?: boolean };
          error.code = "CHECKOUT_RESPONSE_TIMEOUT";
          error.retryable = true;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function parseSubscriptionSetupPayload(
  payload: unknown,
): SubscriptionSetupPayloadResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      error: {
        message:
          "The payment service returned an invalid response. Please try again.",
        code: "INVALID_CHECKOUT_RESPONSE",
        retryable: true,
      },
    };
  }

  const data = payload as Record<string, unknown>;
  if (data.code === "STRIPE_NOT_CONFIGURED") {
    return {
      ok: false,
      error: {
        message: "Payment service is temporarily unavailable.",
        code: "STRIPE_NOT_CONFIGURED",
        retryable: false,
      },
    };
  }

  const clientSecret =
    typeof data.clientSecret === "string" ? data.clientSecret.trim() : "";
  if (!clientSecret) {
    return {
      ok: false,
      error: {
        message:
          "The payment service did not return a usable checkout session. Please try again.",
        code: "INVALID_CHECKOUT_RESPONSE",
        retryable: true,
      },
    };
  }

  return { ok: true, clientSecret };
}

export function normalizeSubscriptionSetupError(
  error: unknown,
): SubscriptionSetupError {
  const data =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const code = typeof data.code === "string" ? data.code : "SETUP_FAILED";
  const retryable =
    typeof data.retryable === "boolean"
      ? data.retryable
      : code !== "STRIPE_NOT_CONFIGURED";
  const messageCandidate =
    typeof data.userMessage === "string"
      ? data.userMessage
      : typeof data.message === "string"
        ? data.message
        : typeof error === "string"
          ? error
          : "Failed to setup payment. Please try again.";

  if (code === "STRIPE_NOT_CONFIGURED") {
    return {
      message: "Payment service is temporarily unavailable. Please try again later.",
      code,
      retryable: false,
    };
  }

  if (code === "SERVICE_UNAVAILABLE") {
    return {
      message: "Payment service is temporarily unavailable. Please try again later.",
      code,
      retryable: true,
    };
  }

  return {
    message: messageCandidate,
    code,
    retryable,
  };
}
