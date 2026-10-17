import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ACCOUNT_AGE_REQUIREMENT, MINIMUM_ACCOUNT_AGE, calculateAgeUtc, getAccountEligibilityError, parseBirthdate } from "../../shared/agePolicy";
import { createCheckoutSessionSchema, registerSchema } from "../../server/schemas/index";

const birthday = new Date("2026-06-15T00:00:00.000Z");

describe("Shared minimum age 16 policy", () => {
  it("accepts the exact UTC sixteenth birthday, not the preceding day", () => {
    expect(MINIMUM_ACCOUNT_AGE).toBe(16);
    expect(getAccountEligibilityError("2010-06-15", birthday)).toBeUndefined();
    expect(getAccountEligibilityError("2010-06-16", birthday)).toBe(ACCOUNT_AGE_REQUIREMENT);
    expect(calculateAgeUtc("2010-06-15", new Date("2026-06-14T23:59:59.999Z"))).toBe(15);
    expect(calculateAgeUtc("2010-06-15", new Date("2026-06-15T23:59:59.999Z"))).toBe(16);
  });

  it("uses UTC even when an instant's written offset crosses a calendar day", () => {
    expect(getAccountEligibilityError("2010-06-15", new Date("2026-06-14T20:00:00-04:00"))).toBeUndefined();
    expect(getAccountEligibilityError("2010-06-15", new Date("2026-06-15T01:00:00+02:00"))).toBe(ACCOUNT_AGE_REQUIREMENT);
  });

  it("validates leap dates and February 29 anniversary boundaries", () => {
    expect(getAccountEligibilityError("2008-02-29", new Date("2024-02-28T23:59:59Z"))).toBe(ACCOUNT_AGE_REQUIREMENT);
    expect(getAccountEligibilityError("2008-02-29", new Date("2024-02-29T00:00:00Z"))).toBeUndefined();
    expect(calculateAgeUtc("2008-02-29", new Date("2025-02-28T12:00:00Z"))).toBe(16);
    expect(calculateAgeUtc("2008-02-29", new Date("2025-03-01T00:00:00Z"))).toBe(17);
    expect(parseBirthdate("1900-02-29")).toBeNull();
    expect(parseBirthdate("2000-02-29")?.toISOString()).toBe("2000-02-29T00:00:00.000Z");
    expect(getAccountEligibilityError("2084-02-29", new Date("2100-02-28T23:59:59Z"))).toBe(ACCOUNT_AGE_REQUIREMENT);
    expect(getAccountEligibilityError("2084-02-29", new Date("2100-03-01T00:00:00Z"))).toBeUndefined();
  });

  it.each([
    undefined, null, "", " ", 20100615, {}, [], "2010-6-15", "2010/06/15",
    "2010-06-15T00:00:00Z", " 2010-06-15", "2010-06-15 ", "2010-02-29",
    "2010-04-31", "2010-13-01", "2010-00-01", "2010-01-00", "0000-01-01",
    "9999-01-01", "2026-06-16",
  ])("fails closed for missing, malformed, normalized-invalid or future DOB %j", value => {
    expect(getAccountEligibilityError(value, birthday)).toEqual(expect.any(String));
  });

  it("shared Zod signup/checkout schemas reject missing and normalized-invalid DOB", () => {
    const account = {
      email: "age-unit@example.test", username: "age_unit", password: "Password1!", confirmPassword: "Password1!",
    };
    const checkout = { tier: "monthly", userEmail: account.email, username: account.username };
    for (const birthdate of [undefined, "2010-02-30", "2999-01-01", "2020-01-01"]) {
      expect(registerSchema.safeParse({ ...account, birthdate }).success).toBe(false);
      expect(createCheckoutSessionSchema.safeParse({ ...checkout, birthdate }).success).toBe(false);
    }
    expect(registerSchema.safeParse({ ...account, birthdate: "1990-06-15" }).success).toBe(true);
    expect(createCheckoutSessionSchema.safeParse({ ...checkout, birthdate: "1990-06-15" }).success).toBe(true);
  });
});

// Extract only the real route callback. Never import routes.ts (which starts
// service/database integration), execute middleware, or invoke any live provider.
const routesSource = readFileSync("server/routes.ts", "utf8");
const routesAst = ts.createSourceFile("routes.ts", routesSource, ts.ScriptTarget.ES2022, true);
function routeCallback(method: string, path: string) {
  let callback = "";
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(routesAst) === "app" && node.expression.name.text === method &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === path) {
      const candidate = node.arguments.at(-1)!;
      if (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) callback = candidate.getText(routesAst);
    }
    ts.forEachChild(node, visit);
  }
  visit(routesAst);
  if (!callback) throw new Error(`Missing route ${method} ${path}`);
  return ts.transpileModule(`globalThis.handler = ${callback}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function responseHarness() {
  return {
    statusCode: 200, body: undefined as any, location: "",
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    redirect(location: string) { this.location = location; return this; },
  };
}

function backendHarness(existingAccount = false) {
  const created: any[] = [];
  let storedUser: any = existingAccount
    ? { id: "existing-user", email: "age-unit@example.test", googleId: "google-unit", twoFactorEnabled: false }
    : undefined;
  const session: Record<string, any> = {};
  const checkoutSession: any = {
    payment_status: "paid", customer_email: "age-unit@example.test", mode: "subscription",
    metadata: { username: "age_unit", tier: "monthly" },
    line_items: { data: [{ price: { id: "unit-price" } }] },
  };
  const scope: Record<string, any> = {
    Date, Number, URLSearchParams, AbortSignal, getAccountEligibilityError, MINIMUM_ACCOUNT_AGE,
    process: { env: { GOOGLE_CLIENT_ID: "unit-id", GOOGLE_CLIENT_SECRET: "unit-not-a-secret", APP_URL: "https://unit.example.test" } },
    crypto: { randomBytes: () => ({ toString: () => "unit-oauth-state" }) },
    logger: { info() {}, warn() {} },
    sessionSave: async () => {}, sessionRegenerate: async () => {},
    assertRegistrationEnabled: async () => {},
    sessionAuthority: async () => ({ issue: async () => "unit-generation" }),
    storage: {
      getUserByEmail: async () => storedUser,
      getUserByUsername: async () => undefined,
      getUser: async () => storedUser,
      createUser: async (user: any) => {
        created.push(user);
        storedUser = { ...user, id: "created-unit", twoFactorEnabled: false };
        return storedUser;
      },
    },
    stripe: { checkout: { sessions: { retrieve: async () => checkoutSession } } },
    SUBSCRIPTION_PLANS: { monthly: { mode: "subscription" } },
    getStripePriceIds: () => ({ monthly: "unit-price" }),
    fetch: async (url: string) => ({
      ok: true,
      json: async () => url.includes("/token") ? { access_token: "unit-token" } : {
        id: "google-unit", verified_email: true, email: "age-unit@example.test",
      },
    }),
  };
  async function invoke(method: string, path: string, body: unknown = {}, query: unknown = {}) {
    const context = vm.createContext({ ...scope });
    vm.runInContext(routeCallback(method, path), context);
    const response = responseHarness();
    await (context.handler as Function)({ body, query, session }, response);
    return response;
  }
  return { invoke, session, created, checkoutSession };
}

describe("Actual account-creation route eligibility gates (offline stubs)", () => {
  it.each([undefined, "2010-02-30", "2999-01-01", "2020-01-01"])(
    "password signup and public checkout reject ineligible DOB %j before creation/payment", async birthdate => {
      const h = backendHarness();
      const signup = await h.invoke("post", "/api/auth/register", {
        email: "age-unit@example.test", username: "age_unit", password: "Password1!", birthdate,
      });
      expect(signup.statusCode).toBe(400);
      const checkout = await h.invoke("post", "/api/create-checkout-session", {
        userEmail: "age-unit@example.test", username: "age_unit", tier: "monthly", birthdate,
      });
      expect(checkout.statusCode).toBe(400);
      expect(h.created).toEqual([]);
    },
  );

  it.each([undefined, "2010-02-30", "2999-01-01", "2020-01-01"])(
    "paid registration rechecks Stripe metadata DOB %j before creating any account", async birthdate => {
      const h = backendHarness();
      h.checkoutSession.metadata.birthdate = birthdate;
      const result = await h.invoke("post", "/api/register-after-payment", {
        sessionId: "cs_unit", password: "Password1!", tosAccepted: true, privacyAccepted: true,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body.code).toBe("REGISTRATION_ELIGIBILITY_REQUIRED");
      expect(result.body.error).toMatch(/contact support before purchasing again/);
      expect(h.created).toEqual([]);
    },
  );

  it("preserves existing-account paid registration sign-in recovery even with no historical DOB", async () => {
    const h = backendHarness(true);
    const result = await h.invoke("post", "/api/register-after-payment", {
      sessionId: "cs_unit", password: "Password1!", tosAccepted: true, privacyAccepted: true,
    });
    expect(result.statusCode).toBe(409);
    expect(result.body.code).toBe("LOGIN_REQUIRED");
    expect(h.created).toEqual([]);
  });

  it("new Google login without signup eligibility is redirected to collect DOB, never created", async () => {
    const h = backendHarness();
    h.session.googleOAuthState = "unit-oauth-state";
    const result = await h.invoke("get", "/api/auth/google/callback", {}, { code: "unit-code", state: "unit-oauth-state" });
    expect(result.location).toBe("/register?error=eligibility_required");
    expect(h.created).toEqual([]);
  });

  it("existing Google login without any DOB remains supported", async () => {
    const h = backendHarness(true);
    h.session.googleOAuthState = "unit-oauth-state";
    const result = await h.invoke("get", "/api/auth/google/callback", {}, { code: "unit-code", state: "unit-oauth-state" });
    expect(result.location).toBe("/dashboard");
    expect(h.session.userId).toBe("existing-user");
    expect(h.created).toEqual([]);
  });

  it("new Google signup validates DOB in POST, binds a DOB-free server receipt to state and consumes it", async () => {
    const h = backendHarness();
    const missing = await h.invoke("post", "/api/auth/google/signup");
    expect(missing.statusCode).toBe(400);
    expect(h.session.googleSignupEligibility).toBeUndefined();
    const eligible = await h.invoke("post", "/api/auth/google/signup", { birthdate: "1990-06-15" });
    expect(eligible.body).toEqual({ success: true });
    expect(h.session.googleSignupEligibility.minimumAge).toBe(16);
    expect(JSON.stringify(h.session)).not.toContain("1990-06-15");
    const start = await h.invoke("get", "/api/auth/google");
    expect(start.location).toMatch(/^https:\/\/accounts.google.com\//);
    expect(start.location).not.toContain("1990");
    expect(start.location).not.toMatch(/birthdate|minimumAge/);
    expect(h.session.googleSignupEligibility).toBeUndefined();
    expect(h.session.googleOAuthEligibility.state).toBe("unit-oauth-state");
    const callback = await h.invoke("get", "/api/auth/google/callback", {}, { code: "unit-code", state: "unit-oauth-state" });
    expect(callback.location).toBe("/dashboard");
    expect(h.created).toHaveLength(1);
    expect(h.session.googleOAuthEligibility).toBeUndefined();
    expect(h.session.googleOAuthState).toBeUndefined();
  });

  it("a failed Google eligibility replacement cannot reuse an earlier valid receipt", async () => {
    const h = backendHarness();
    await h.invoke("post", "/api/auth/google/signup", { birthdate: "1990-06-15" });
    expect(h.session.googleSignupEligibility).toBeDefined();
    const denied = await h.invoke("post", "/api/auth/google/signup", { birthdate: "2020-01-01" });
    expect(denied.statusCode).toBe(400);
    expect(h.session.googleSignupEligibility).toBeUndefined();
  });

  it.each(["expired", "wrong-state", "old-policy"])("rejects a %s Google signup receipt without creating a new account", async failure => {
    const h = backendHarness();
    h.session.googleOAuthState = "unit-oauth-state";
    h.session.googleOAuthEligibility = {
      minimumAge: failure === "old-policy" ? 13 : 16,
      expiresAt: Date.now() + (failure === "expired" ? -1000 : 600_000),
      state: failure === "wrong-state" ? "other-state" : "unit-oauth-state",
    };
    const result = await h.invoke("get", "/api/auth/google/callback", {}, { code: "unit-code", state: "unit-oauth-state" });
    expect(result.location).toBe("/register?error=eligibility_required");
    expect(h.created).toEqual([]);
  });

  it("Google eligibility POST has explicit CSRF validation despite the existing OAuth path exemption", () => {
    expect(routesSource).toMatch(/app\.post\("\/api\/auth\/google\/signup", registerRateLimiter, requireCsrfToken,/);
  });

  it("edited registration/policy sources have no obvious TypeScript/TSX syntax errors", () => {
    for (const path of [
      "server/routes.ts", "server/schemas/index.ts", "server/services/consentService.ts",
      "server/services/supportAIService.ts", "shared/agePolicy.ts", "client/src/pages/Register.tsx",
      "client/src/pages/RegisterPayment.tsx", "client/src/pages/Terms.tsx",
    ]) {
      const result = ts.transpileModule(readFileSync(path, "utf8"), {
        fileName: path, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      });
      expect(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), path).toEqual([]);
    }
  });
});
