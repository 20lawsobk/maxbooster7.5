import { getAccountEligibilityError } from "../../../shared/agePolicy";

export interface RegistrationCheckoutInput {
  username: string;
  artistName?: string;
  email: string;
  birthdate: string;
}

export interface NormalizedRegistrationCheckoutInput {
  username: string;
  artistName: string;
  email: string;
  birthdate: string;
}

export const REGISTRATION_CHECKOUT_BODY_TIMEOUT_MS = 10_000;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrationCheckoutInput(
  input: RegistrationCheckoutInput,
  now: Date = new Date(),
): NormalizedRegistrationCheckoutInput {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const birthdate = input.birthdate.trim();
  const artistName = (input.artistName ?? "").trim();

  if (!username || !email || !birthdate) {
    throw new Error("Please fill in all required fields");
  }

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Username must be 3-30 characters and contain only letters, numbers, or underscores",
    );
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error("Please enter a valid email address");
  }

  if (artistName.length > 100) {
    throw new Error("Artist / producer name must be 100 characters or fewer");
  }

  const eligibilityError = getAccountEligibilityError(birthdate, now);
  if (eligibilityError) throw new Error(eligibilityError);

  return { username, artistName, email, birthdate };
}

export async function readRegistrationCheckoutPayload(
  response: Pick<Response, "json">,
  timeoutMs: number = REGISTRATION_CHECKOUT_BODY_TIMEOUT_MS,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            "The checkout response took too long to finish loading. Please try again.",
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

export function getStripeCheckoutUrl(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The payment service returned an invalid response. Please try again.");
  }

  const rawUrl = (payload as Record<string, unknown>).url;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("The payment service did not return a checkout link. Please try again.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("The payment service returned an invalid checkout link. Please try again.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isStripeHost = hostname === "stripe.com" || hostname.endsWith(".stripe.com");
  if (parsed.protocol !== "https:" || !isStripeHost) {
    throw new Error("The payment service returned an unsafe checkout link. Please try again.");
  }

  return parsed.toString();
}
