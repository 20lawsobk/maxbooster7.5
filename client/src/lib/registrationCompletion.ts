export const REGISTRATION_COMPLETION_BODY_TIMEOUT_MS = 10_000;
const CHECKOUT_SESSION_RE = /^cs_[a-zA-Z0-9_]+$/;

export interface RegistrationCompletionError extends Error {
  code?: string;
  accountCreated?: boolean;
}

export function validateCheckoutSessionId(value: string | null): string {
  const sessionId = value?.trim() ?? "";
  if (
    !sessionId ||
    sessionId.length > 255 ||
    !CHECKOUT_SESSION_RE.test(sessionId)
  ) {
    throw new Error("Invalid payment session. Please return to pricing and try again.");
  }
  return sessionId;
}

export function validateRegistrationPassword(
  password: string,
  confirmPassword: string,
): void {
  if (password !== confirmPassword) {
    throw new Error("Passwords do not match");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
  if (password.length > 72) {
    throw new Error("Password must be 72 characters or fewer");
  }
}

export async function readRegistrationCompletionPayload(
  response: Pick<Response, "json">,
  timeoutMs: number = REGISTRATION_COMPLETION_BODY_TIMEOUT_MS,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            "The registration response took too long to finish loading. Please try again.",
          ) as RegistrationCompletionError;
          error.code = "REGISTRATION_RESPONSE_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function parseVerificationPayload(payload: unknown): void {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    (payload as Record<string, unknown>).verified !== true
  ) {
    throw new Error("The payment service returned an invalid verification response.");
  }
}

export function parseRegistrationCompletionPayload(payload: unknown): {
  userId: string;
  consentRecorded: true;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The registration service returned an invalid response.");
  }

  const data = payload as Record<string, unknown>;
  if (data.accountCreated === true && typeof data.code === "string") {
    const error = new Error(
      typeof data.message === "string"
        ? data.message
        : "Your account was created, but registration needs attention.",
    ) as RegistrationCompletionError;
    error.code = data.code;
    error.accountCreated = true;
    throw error;
  }

  const user =
    data.user && typeof data.user === "object" && !Array.isArray(data.user)
      ? (data.user as Record<string, unknown>)
      : null;
  const userId = user && typeof user.id === "string" ? user.id : "";
  if (!userId || data.consentRecorded !== true) {
    throw new Error("Account creation did not finish completely. Please try again.");
  }

  return { userId, consentRecorded: true };
}
