import { timingSafeEqual } from "node:crypto";

type E2ePolicyEnvironment = Readonly<Record<string, string | undefined>>;

type RegistrationInput = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
};

type UserIdentity = {
  id?: unknown;
  role?: unknown;
  username?: unknown;
  email?: unknown;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const TEST_EMAIL_DOMAIN = "maxbooster-test.invalid";

function enabledInDevelopment(
  flag: "MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED" |
    "MAXBOOSTER_REGULAR_E2E_ACCESS_ENABLED",
  env: E2ePolicyEnvironment,
): boolean {
  return env.NODE_ENV === "development" &&
    !env.REPLIT_DEPLOYMENT &&
    env[flag]?.trim().toLowerCase() === "true";
}

function constantTimeEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes);
}

export function regularE2eEmail(username: string): string {
  return `${username.toLowerCase()}@${TEST_EMAIL_DOMAIN}`;
}

/** Allows the single configured account to register only in the dev workspace. */
export function isRegularE2eRegistration(
  input: RegistrationInput,
  env: E2ePolicyEnvironment = process.env,
): boolean {
  if (!enabledInDevelopment("MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED", env)) {
    return false;
  }

  const expectedUsername = env.MAXBOOSTER_REGULAR_E2E_USERNAME?.trim();
  const expectedPassword = env.MAXBOOSTER_REGULAR_E2E_PASSWORD;
  if (!expectedUsername || !expectedPassword ||
      !USERNAME_PATTERN.test(expectedUsername) ||
      typeof input.username !== "string" ||
      typeof input.email !== "string" ||
      typeof input.password !== "string") {
    return false;
  }

  return input.username === expectedUsername &&
    input.email === regularE2eEmail(expectedUsername) &&
    constantTimeEqual(input.password, expectedPassword);
}

/** Only the exact provisioned regular user is admitted during dev testing. */
export function isRegularE2eUser(
  user: UserIdentity | undefined,
  env: E2ePolicyEnvironment = process.env,
): boolean {
  if (!enabledInDevelopment("MAXBOOSTER_REGULAR_E2E_ACCESS_ENABLED", env)) {
    return false;
  }

  const expectedId = env.MAXBOOSTER_REGULAR_E2E_ACCESS_USER_ID?.trim();
  const expectedUsername = env.MAXBOOSTER_REGULAR_E2E_USERNAME?.trim();
  if (!expectedId || !expectedUsername || !user) return false;

  return user.id === expectedId &&
    user.role === "user" &&
    user.username === expectedUsername &&
    user.email === regularE2eEmail(expectedUsername);
}
