import { RequestHandler, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { isProductionEnv } from "../lib/envHelpers.js";
import {
  ACCOUNT_AGE_REQUIREMENT,
  calculateAgeUtc,
  MINIMUM_ACCOUNT_AGE,
} from "../../shared/agePolicy.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const REGISTRATION_USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const REGISTRATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTRATION_SESSION_RE = /^cs_[a-zA-Z0-9_]+$/;
const ONBOARDING_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const ONBOARDING_PERSONAS = new Set(["artist", "producer", "label", "manager"]);
const ONBOARDING_ARRAY_LIMITS: Record<string, { items: number; length: number }> = {
  goals: { items: 20, length: 64 },
  connectedPlatforms: { items: 30, length: 100 },
  connectedAccounts: { items: 30, length: 100 },
  completedSteps: { items: 100, length: 128 },
};
const ONBOARDING_DATA_MAX_BYTES = 16 * 1024;

export type RegistrationCheckoutBoundaryResult =
  | {
      ok: true;
      value: {
        tier: "monthly" | "yearly" | "lifetime";
        userEmail: string;
        username: string;
        birthdate: string;
        artistName: string;
        tosAccepted: true;
        privacyAccepted: true;
      };
    }
  | { ok: false; message: string };

export type RegistrationCompletionBoundaryResult =
  | {
      ok: true;
      value: {
        sessionId: string;
        password: string;
        tosAccepted: true;
        privacyAccepted: true;
        marketingConsent: boolean;
      };
    }
  | { ok: false; message: string };

export type OnboardingUpdateBoundaryResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function normalizedCheckoutSessionId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const sessionId =
    typeof (body as Record<string, unknown>).sessionId === "string"
      ? ((body as Record<string, unknown>).sessionId as string).trim()
      : "";
  if (
    !sessionId ||
    sessionId.length > 255 ||
    !REGISTRATION_SESSION_RE.test(sessionId)
  ) {
    return null;
  }
  return sessionId;
}

export function normalizeRegistrationCheckoutBody(
  body: unknown,
  now: Date = new Date(),
): RegistrationCheckoutBoundaryResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid checkout request" };
  }

  const input = body as Record<string, unknown>;
  const tier = typeof input.tier === "string" ? input.tier.trim() : "";
  if (!(["monthly", "yearly", "lifetime"] as const).includes(tier as any)) {
    return { ok: false, message: "Invalid subscription tier" };
  }

  const userEmail =
    typeof input.userEmail === "string"
      ? input.userEmail.trim().toLowerCase()
      : "";
  if (
    !userEmail ||
    userEmail.length > 254 ||
    !REGISTRATION_EMAIL_RE.test(userEmail)
  ) {
    return { ok: false, message: "Invalid email format" };
  }

  const username =
    typeof input.username === "string" ? input.username.trim() : "";
  if (!REGISTRATION_USERNAME_RE.test(username)) {
    return {
      ok: false,
      message:
        "Username must be 3-30 characters and contain only letters, numbers, or underscores",
    };
  }

  const artistName =
    typeof input.artistName === "string" ? input.artistName.trim() : "";
  if (artistName.length > 100) {
    return {
      ok: false,
      message: "Artist / producer name must be 100 characters or fewer",
    };
  }

  const birthdate =
    typeof input.birthdate === "string" ? input.birthdate.trim() : "";
  const parsedBirthdate = parseCalendarDate(birthdate);
  if (!parsedBirthdate) {
    return { ok: false, message: "Invalid birthdate format" };
  }

  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (parsedBirthdate > todayUtc) {
    return { ok: false, message: "Birthdate cannot be in the future" };
  }
  const age = calculateAgeUtc(birthdate, now);
  if (age === null) {
    return {
      ok: false,
      message: "Birthdate must be a valid date that is not in the future",
    };
  }
  if (age < MINIMUM_ACCOUNT_AGE) {
    return {
      ok: false,
      message: ACCOUNT_AGE_REQUIREMENT,
    };
  }

  if (input.tosAccepted !== true) {
    return {
      ok: false,
      message:
        "You must accept the Terms of Service before continuing to payment",
    };
  }
  if (input.privacyAccepted !== true) {
    return {
      ok: false,
      message:
        "You must accept the Privacy Policy before continuing to payment",
    };
  }

  return {
    ok: true,
    value: {
      tier: tier as "monthly" | "yearly" | "lifetime",
      userEmail,
      username,
      birthdate,
      artistName,
      tosAccepted: true,
      privacyAccepted: true,
    },
  };
}

export function normalizeRegistrationVerificationBody(
  body: unknown,
):
  | { ok: true; value: { sessionId: string } }
  | { ok: false; message: string } {
  const sessionId = normalizedCheckoutSessionId(body);
  if (!sessionId) {
    return { ok: false, message: "Invalid checkout session" };
  }
  return { ok: true, value: { sessionId } };
}

export function normalizeRegistrationCompletionBody(
  body: unknown,
): RegistrationCompletionBoundaryResult {
  const sessionId = normalizedCheckoutSessionId(body);
  if (!sessionId || !body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid checkout session" };
  }

  const input = body as Record<string, unknown>;
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters long",
    };
  }
  if (password.length > 72) {
    return { ok: false, message: "Password must be 72 characters or fewer" };
  }
  if (input.tosAccepted !== true) {
    return { ok: false, message: "Terms of Service acceptance is required" };
  }
  if (input.privacyAccepted !== true) {
    return { ok: false, message: "Privacy Policy acceptance is required" };
  }
  if (
    input.marketingConsent !== undefined &&
    typeof input.marketingConsent !== "boolean"
  ) {
    return { ok: false, message: "Invalid marketing consent value" };
  }

  return {
    ok: true,
    value: {
      sessionId,
      password,
      tosAccepted: true,
      privacyAccepted: true,
      marketingConsent: input.marketingConsent === true,
    },
  };
}

function normalizeBoundedStringArray(
  value: unknown,
  field: string,
): { ok: true; value: string[] } | { ok: false; message: string } {
  const limits = ONBOARDING_ARRAY_LIMITS[field];
  if (!Array.isArray(value) || value.length > limits.items) {
    return { ok: false, message: `Invalid onboarding field: ${field}` };
  }

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, message: `Invalid onboarding field: ${field}` };
    }
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > limits.length) {
      return { ok: false, message: `Invalid onboarding field: ${field}` };
    }
    normalized.push(trimmed);
  }

  return { ok: true, value: normalized };
}

export function normalizeOnboardingUpdateBody(
  body: unknown,
): OnboardingUpdateBoundaryResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid onboarding update" };
  }

  const input = body as Record<string, unknown>;
  const allowedTopLevel = new Set([
    "step",
    "completed",
    "hasCompletedOnboarding",
    "onboardingData",
  ]);
  if (Object.keys(input).some((key) => !allowedTopLevel.has(key))) {
    return { ok: false, message: "Unsupported onboarding update field" };
  }

  const output: Record<string, unknown> = {};

  if (input.step !== undefined) {
    if (
      typeof input.step !== "number" ||
      !Number.isInteger(input.step) ||
      input.step < 0 ||
      input.step > 100
    ) {
      return { ok: false, message: "Invalid onboarding step" };
    }
    output.step = input.step;
  }

  for (const field of ["completed", "hasCompletedOnboarding"] as const) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "boolean") {
        return { ok: false, message: `Invalid onboarding field: ${field}` };
      }
      output[field] = input[field];
    }
  }

  if (
    typeof input.completed === "boolean" &&
    typeof input.hasCompletedOnboarding === "boolean" &&
    input.completed !== input.hasCompletedOnboarding
  ) {
    return { ok: false, message: "Conflicting onboarding completion values" };
  }

  if (input.onboardingData !== undefined) {
    if (
      !input.onboardingData ||
      typeof input.onboardingData !== "object" ||
      Array.isArray(input.onboardingData)
    ) {
      return { ok: false, message: "Invalid onboarding data" };
    }

    let serialized = "";
    try {
      serialized = JSON.stringify(input.onboardingData);
    } catch {
      return { ok: false, message: "Invalid onboarding data" };
    }
    if (Buffer.byteLength(serialized, "utf8") > ONBOARDING_DATA_MAX_BYTES) {
      return { ok: false, message: "Onboarding data is too large" };
    }

    const data = {
      ...(input.onboardingData as Record<string, unknown>),
    };

    for (const field of ["persona", "accountType"] as const) {
      if (
        data[field] !== undefined &&
        data[field] !== null &&
        (typeof data[field] !== "string" ||
          !ONBOARDING_PERSONAS.has(data[field] as string))
      ) {
        return { ok: false, message: `Invalid onboarding field: ${field}` };
      }
    }

    for (const field of ["experienceLevel", "userLevel"] as const) {
      if (
        data[field] !== undefined &&
        data[field] !== null &&
        (typeof data[field] !== "string" ||
          !ONBOARDING_LEVELS.has(data[field] as string))
      ) {
        return { ok: false, message: `Invalid onboarding field: ${field}` };
      }
    }

    if (
      data.preferSimplifiedView !== undefined &&
      typeof data.preferSimplifiedView !== "boolean"
    ) {
      return {
        ok: false,
        message: "Invalid onboarding field: preferSimplifiedView",
      };
    }

    for (const field of Object.keys(ONBOARDING_ARRAY_LIMITS)) {
      if (data[field] === undefined) continue;
      const normalized = normalizeBoundedStringArray(data[field], field);
      if (!normalized.ok) return normalized;
      data[field] = normalized.value;
    }

    if (data.skippedAt !== undefined) {
      if (
        typeof data.skippedAt !== "string" ||
        data.skippedAt.length > 100 ||
        !Number.isFinite(Date.parse(data.skippedAt))
      ) {
        return { ok: false, message: "Invalid onboarding field: skippedAt" };
      }
    }

    output.onboardingData = data;
  }

  if (Object.keys(output).length === 0) {
    return { ok: false, message: "Onboarding update is empty" };
  }

  return { ok: true, value: output };
}

function installRegistrationConsentFinalizer(
  req: Request,
  res: Response,
  completion: RegistrationCompletionBoundaryResult & { ok: true },
): void {
  const originalJson = res.json.bind(res);
  let handled = false;

  res.json = ((payload: unknown) => {
    if (handled) return originalJson(payload);

    const userId =
      payload && typeof payload === "object"
        ? (payload as { user?: { id?: unknown } }).user?.id
        : undefined;
    if (
      res.statusCode >= 400 ||
      typeof userId !== "string" ||
      userId.length === 0
    ) {
      return originalJson(payload);
    }

    handled = true;
    void import("../services/registrationConsentFinalizer.js")
      .then(({ finalizePaidRegistrationConsent }) =>
        finalizePaidRegistrationConsent({
          sessionId: completion.value.sessionId,
          userId,
          marketingConsent: completion.value.marketingConsent,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
        }),
      )
      .then(() => {
        if (res.headersSent) return;
        const enriched =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? { ...(payload as Record<string, unknown>), consentRecorded: true }
            : payload;
        originalJson(enriched);
      })
      .catch((error: unknown) => {
        logger.error(
          {
            err: error,
            userId,
            checkoutSessionId: completion.value.sessionId,
          },
          "Paid registration account created but consent evidence finalization failed",
        );
        if (res.headersSent) return;
        res.status(500);
        originalJson({
          error: "Account created but registration finalization failed",
          message:
            "Your paid account was created, but we could not finish the registration record. Please sign in and contact support if prompted.",
          code: "ACCOUNT_CREATED_CONSENT_PENDING",
          accountCreated: true,
        });
      });

    return res;
  }) as Response["json"];
}

export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_RE.test(value);
}

export function requireUUIDParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const val = req.params[paramName];
    if (!isValidUUID(val)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message: `Parameter '${paramName}' must be a valid UUID.`,
      });
    }
    next();
  };
}

export function requireSafeParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const val = req.params[paramName];
    if (!isSafeId(val)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message: `Parameter '${paramName}' contains invalid characters.`,
      });
    }
    next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

const EXEMPT_PATH_PREFIXES = [
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/demo",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify",
  "/api/auth/token/refresh",
  "/api/auth/google",
  "/api/errors",
  "/api/sendgrid/webhook",
  "/health",
  "/ready",
  "/status",
  "/api/ai-service/",
  "/api/training/internal/",
];

function getAllowedOrigins(req: Request): string[] {
  const host = req.headers.host || "";
  const proto =
    req.secure || req.headers["x-forwarded-proto"] === "https"
      ? "https"
      : "http";

  const origins: string[] = [`${proto}://${host}`];

  const replSlug = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  if (replSlug && replOwner) {
    origins.push(`https://${replSlug}.${replOwner}.repl.co`);
    origins.push(`https://${replSlug}--${replOwner}.repl.co`);
    origins.push(`https://${replSlug}.replit.app`);
  }

  const appUrl = process.env.APP_URL || process.env.REPLIT_APP_URL;
  if (appUrl) {
    try {
      origins.push(new URL(appUrl).origin);
    } catch {}
  }

  origins.push(
    "https://maxbooster.replit.app",
    "https://max-booster.com",
    "https://www.max-booster.com",
  );

  return origins;
}

export const originValidation: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const normalizedPath = req.path.replace(/\/$/, "");

  if (
    req.method === "POST" &&
    normalizedPath === "/api/create-checkout-session"
  ) {
    const boundary = normalizeRegistrationCheckoutBody(req.body);
    if (!boundary.ok) {
      return res.status(400).json({ error: boundary.message });
    }
    req.body = { ...(req.body as Record<string, unknown>), ...boundary.value };
  }

  if (
    req.method === "POST" &&
    normalizedPath === "/api/verify-checkout-session"
  ) {
    const boundary = normalizeRegistrationVerificationBody(req.body);
    if (!boundary.ok) {
      return res.status(400).json({ error: boundary.message });
    }
    req.body = { ...(req.body as Record<string, unknown>), ...boundary.value };
  }

  if (
    req.method === "POST" &&
    normalizedPath === "/api/register-after-payment"
  ) {
    const boundary = normalizeRegistrationCompletionBody(req.body);
    if (!boundary.ok) {
      return res.status(400).json({ error: boundary.message });
    }
    req.body = { ...(req.body as Record<string, unknown>), ...boundary.value };
    installRegistrationConsentFinalizer(req, res, boundary);
  }

  if (
    req.method === "POST" &&
    normalizedPath === "/api/auth/update-onboarding"
  ) {
    const boundary = normalizeOnboardingUpdateBody(req.body);
    if (!boundary.ok) {
      return res.status(400).json({ error: boundary.message });
    }
    req.body = boundary.value;
  }

  if (SAFE_METHODS.has(req.method)) return next();

  const isExempt = EXEMPT_PATH_PREFIXES.some((prefix) =>
    req.path.startsWith(prefix),
  );
  if (isExempt) return next();

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  if (!origin && !referer) {
    if (!isProductionEnv()) return next();
    logger.warn(
      { ip: req.ip, userAgent: req.get("user-agent") },
      `Mutation without Origin: ${req.method} ${req.path}`,
    );
    return next();
  }

  let requestOrigin: string | null = null;
  if (origin) {
    requestOrigin = origin;
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return next();
    }
  }

  if (!requestOrigin) return next();

  const allowed = getAllowedOrigins(req);
  if (!allowed.includes(requestOrigin)) {
    logger.warn(
      { requestOrigin, allowed, ip: req.ip },
      `Origin blocked: ${req.method} ${req.path}`,
    );
    return res.status(403).json({
      error: "Origin not allowed",
      message: "Request blocked: unexpected origin.",
    });
  }

  next();
};
