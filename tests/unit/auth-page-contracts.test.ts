import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as agePolicy from "../../shared/agePolicy";
import * as passwordPolicy from "../../shared/passwordPolicy";

type Element = { type: unknown; props: Record<string, any> };

// A deliberately small hook/JSX harness: exercises the real page event handlers
// without a browser, AuthProvider, server imports, credentials, or network.
function pageHarness(page: string, search = "", authLoading = false, user: { id: string } | null = null) {
  const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
  const slots: any[] = [];
  let cursor = 0;
  let request: (...args: any[]) => Promise<Response> = async () => {
    throw new Error("Unexpected fetch in auth page unit test");
  };
  const calls: any[][] = [];
  const cache: any[][] = [];
  const tokens: unknown[] = [];
  const authenticationCalls: { exchange?: { response: Response; data: Record<string, unknown> } }[] = [];
  let insideAuthentication = false;
  let authenticationError: Error | undefined;
  const authenticate = async (operation: () => Promise<{ response: Response; data: Record<string, unknown> }>) => {
    const call: typeof authenticationCalls[number] = {};
    authenticationCalls.push(call);
    insideAuthentication = true;
    try {
      const exchange = await operation();
      call.exchange = exchange;
      if (authenticationError) throw authenticationError;
      return exchange; // Provider boundary behavior is tested by coordinator.
    } finally {
      insideAuthentication = false;
    }
  };
  const navigations: string[] = [];
  const toasts: any[] = [];
  let csrfToken: string | null = "unit-csrf";
  let tick: (() => void) | undefined;
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: any) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (fn: () => unknown) => fn(),
    useEffect: () => {},
  };
  const exports: Record<string, any> = {};
  const context = {
    exports, Error, Response, URLSearchParams, AbortSignal,
    window: { location: { search, pathname: `/${page.toLowerCase()}`, hash: "", href: "" } },
    fetch: async (...args: any[]) => {
      if (["/api/auth/login", "/api/auth/demo", "/api/auth/register"].includes(args[0])) {
        expect(insideAuthentication).toBe(true);
      }
      calls.push(args);
      return request(...args);
    },
    setInterval: (callback: () => void) => { tick = callback; return 1; },
    clearInterval: () => { tick = undefined; },
    require(id: string) {
      if (id === "react") return hooks;
      if (id === "@shared/agePolicy") return agePolicy;
      if (id === "@shared/passwordPolicy") return passwordPolicy;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (id === "wouter") return {
        Link: "Link", useLocation: () => ["", (path: string) => navigations.push(path)],
      };
      if (id === "@tanstack/react-query") return {
        useQueryClient: () => ({ setQueryData: (...args: any[]) => cache.push(args) }),
      };
      if (id.endsWith("/useAuth")) return { useAuth: () => ({ user, isLoading: authLoading, authenticate }) };
      if (id.endsWith("/use-toast")) return { useToast: () => ({ toast: (value: unknown) => toasts.push(value) }) };
      if (id.endsWith("/queryClient")) return {
        getCsrfTokenFromCookie: () => csrfToken, setAuthToken: (value: unknown) => tokens.push(value),
      };
      return new Proxy({}, { get: (_target, name) => String(name) });
    },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: `${page}.tsx`,
  });
  expect(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  vm.runInNewContext(compiled.outputText, context);
  let tree: Element;
  function render() { cursor = 0; tree = exports.default(); return tree; }
  function all(node: any): Element[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(child => all(child));
    return [node, ...(node.props?.children === undefined ? [] : all(node.props.children))];
  }
  function find(key: string, value: string) {
    const element = all(tree).find(node => node.props?.[key] === value);
    if (!element) throw new Error(`Missing ${key}=${value} on ${page}`);
    return element;
  }
  function input(id: string, value: string) {
    find("id", id).props.onChange({ target: { value } });
    render();
  }
  async function submit() {
    const form = all(tree).find(node => node.type === "form");
    if (!form) throw new Error(`Missing form on ${page}`);
    return form.props.onSubmit({ preventDefault() {} });
  }
  render();
  return {
    render, all: () => all(tree), find, input, submit, calls, cache, tokens, navigations, toasts, authenticationCalls,
    location: context.window.location,
    transport(fn: typeof request) { request = fn; },
    csrf(value: string | null) { csrfToken = value; },
    failAuthentication(error: Error) { authenticationError = error; },
    elapseCooldown() { for (let i = 0; i < 60; i++) tick?.(); render(); },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function registration(h: ReturnType<typeof pageHarness>) {
  h.input("birthdate", "1990-06-15");
  h.input("username", "artist_1");
  h.input("email", "unit@example.test");
  h.input("password", "Password1!");
  h.input("confirmPassword", "Password1!");
  h.find("id", "terms").props.onCheckedChange(true);
  h.render();
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Landing page demo authentication", () => {
  it("uses the provider boundary and prevents duplicate demo exchanges", async () => {
    const h = pageHarness("Landing");
    const pending = deferred();
    h.transport(() => pending.promise);
    const start = h.find("data-testid", "button-watch-demo").props.onClick;
    const first = start();
    await start();
    await Promise.resolve();
    expect(h.calls).toHaveLength(1);
    expect(h.authenticationCalls).toHaveLength(1);
    expect(h.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    pending.resolve(json({ id: "demo-user", isDemo: true }));
    await first;
    expect(h.navigations).toEqual(["/dashboard"]);
    expect(h.tokens).toEqual([]);
  });

  it("keeps an existing account instead of replacing it with a demo session", async () => {
    const h = pageHarness("Landing", "", false, { id: "existing-user" });
    await h.find("data-testid", "button-watch-demo").props.onClick();
    expect(h.calls).toEqual([]);
    expect(h.navigations).toEqual(["/dashboard"]);
  });

  it("does not navigate when authoritative session verification fails", async () => {
    const h = pageHarness("Landing");
    h.transport(async () => json({ id: "demo-user", isDemo: true }));
    h.failAuthentication(new Error("The active session could not be verified"));
    await h.find("data-testid", "button-watch-demo").props.onClick();
    h.render();
    expect(h.navigations).toEqual([]);
    expect(h.toasts[0].description).toContain("could not be verified");
    expect(h.find("data-testid", "button-watch-demo").props.disabled).toBe(false);
  });

  it("releases controls on malformed responses and waits for initial authentication", async () => {
    const loading = pageHarness("Landing", "", true);
    await loading.find("data-testid", "button-watch-demo").props.onClick();
    expect(loading.calls).toEqual([]);
    const h = pageHarness("Landing");
    h.transport(async () => new Response("not-json"));
    await h.find("data-testid", "button-watch-demo").props.onClick();
    h.render();
    expect(h.navigations).toEqual([]);
    expect(h.find("data-testid", "button-watch-demo").props.disabled).toBe(false);
    expect(h.toasts[0].description).toContain("invalid response");
    expect(h.all().some(node => node.props?.href === "/api-docs")).toBe(true);
    expect(h.all().some(node => node.props?.href === "/api")).toBe(false);
  });
});

describe("Login page contract and request lifecycle", () => {
  it("trims the identifier, handles MFA without caching a user, preserves fresh-code guidance", async () => {
    const h = pageHarness("Login");
    h.input("username", "  unit@example.test  ");
    h.input("password", "Password1!");
    h.transport(async () => json({ requiresTwoFactor: true }));
    await h.submit(); h.render();
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(1);
    expect(h.authenticationCalls[0].exchange?.data).toEqual({ requiresTwoFactor: true });
    expect(JSON.parse(h.calls[0][1].body)).toEqual({ username: "unit@example.test", password: "Password1!" });
    expect(h.calls[0][1].headers["x-csrf-token"]).toBe("unit-csrf");
    expect(h.find("id", "twoFactorCode").props.autoComplete).toBe("one-time-code");
    h.input("twoFactorCode", "123");
    await h.submit();
    expect(h.calls).toHaveLength(1);
    h.input("twoFactorCode", "123456");
    h.transport(async () => json({ message: "Invalid or already used 2FA code. Wait for a new code." }, 401));
    await h.submit(); h.render();
    expect(h.find("id", "2fa-error").props.children.join(" ")).toContain("Wait for a fresh 6-digit");
    expect(h.find("id", "twoFactorCode").props.value).toBe("");
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(2);
    expect(h.authenticationCalls[1].exchange?.response.status).toBe(401);
  });

  it("locks out concurrent login/demo actions and releases controls after a malformed response", async () => {
    const h = pageHarness("Login");
    h.input("username", "artist");
    h.input("password", "Password1!");
    const pending = deferred();
    h.transport(() => pending.promise);
    const first = h.submit();
    h.render();
    await h.submit();
    await h.find("data-testid", "button-demo-login").props.onClick();
    expect(h.find("data-testid", "button-google-login").props.disabled).toBe(true);
    pending.resolve(json(null));
    await first; h.render();
    expect(h.calls).toHaveLength(1);
    expect(h.cache).toEqual([]);
    expect(h.find("data-testid", "button-login-submit").props.disabled).toBe(false);
  });

  it.each(["//outside.test", "/\\outside.test", "/\noutside.test", "https://outside.test"])(
    "rejects unsafe post-login redirect %j and delegates cookie-only completion to the provider", async redirect => {
      const h = pageHarness("Login", `?redirect=${encodeURIComponent(redirect)}`);
      h.input("username", "artist"); h.input("password", "Password1!");
      h.transport(async () => json({ id: "unit-user", sessionToken: null }));
      await h.submit();
      expect(h.navigations).toEqual(["/dashboard"]);
      expect(h.tokens).toEqual([]);
      expect(h.cache).toEqual([]);
      expect(h.authenticationCalls).toHaveLength(1);
      expect(h.authenticationCalls[0].exchange?.data.sessionToken).toBe(null);
    },
  );

  it("keeps a safe internal redirect and delegates bearer/cache completion to the provider", async () => {
    const h = pageHarness("Login", "?redirect=%2Fsettings%3Ftab%3Dsecurity");
    h.input("username", "artist"); h.input("password", "Password1!");
    h.transport(async () => json({ id: "unit-user", sessionToken: "unit-only-token" }));
    await h.submit();
    expect(h.navigations).toEqual(["/settings?tab=security"]);
    expect(h.cache).toEqual([]);
    expect(h.tokens).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(1);
    expect(h.authenticationCalls[0].exchange?.data.sessionToken).toBe("unit-only-token");
  });

  it("demo uses CSRF inside authenticate and delegates cookie-only completion to the provider", async () => {
    const h = pageHarness("Login");
    h.transport(async () => json({ id: "demo-unit", isDemo: true }));
    await h.find("data-testid", "button-demo-login").props.onClick();
    expect(h.calls[0][0]).toBe("/api/auth/demo");
    expect(h.calls[0][1].headers["x-csrf-token"]).toBe("unit-csrf");
    expect(h.tokens).toEqual([]);
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(1);
    expect(h.authenticationCalls[0].exchange?.data).toEqual({ id: "demo-unit", isDemo: true });
  });

  it("bootstraps missing CSRF, and does not mistake security-token failures for bad credentials", async () => {
    const h = pageHarness("Login");
    h.csrf(null);
    h.input("username", "artist"); h.input("password", "Password1!");
    h.transport(async (url) => url === "/api/csrf-token"
      ? json({ csrfToken: "bootstrapped-unit-csrf" })
      : json({ message: "Invalid security token. Please refresh the page and try again." }, 403));
    await h.submit();
    expect(h.calls[1][1].headers["x-csrf-token"]).toBe("bootstrapped-unit-csrf");
    expect(h.toasts.at(-1).title).toBe("Security Token Error");
    expect(h.calls).toHaveLength(2); // No automatic replay of a credential POST.
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(1);
  });

  it("a malformed CSRF bootstrap fails closed before credential submission", async () => {
    const h = pageHarness("Login");
    h.csrf(null);
    h.input("username", "artist"); h.input("password", "Password1!");
    h.transport(async () => json(null));
    await h.submit(); h.render();
    expect(h.calls).toHaveLength(1);
    expect(h.toasts.at(-1).description).toMatch(/Unable to establish the security token/);
    expect(h.find("data-testid", "button-login-submit").props.disabled).toBe(false);
  });
});

describe("Register page contract", () => {
  it("requires a real eligible birthday before password or Google signup, with no default or automatic eligibility", async () => {
    const h = pageHarness("Register");
    registration(h);
    h.input("birthdate", "");
    await h.submit(); h.render();
    await h.find("data-testid", "button-google-signup").props.onClick();
    expect(h.calls).toEqual([]);
    expect(h.authenticationCalls).toEqual([]);
    expect(h.location.href).toBe("");
    h.input("birthdate", "2010-02-30");
    await h.submit();
    expect(h.calls).toEqual([]);
    h.input("birthdate", "2020-01-01");
    await h.find("data-testid", "button-google-signup").props.onClick();
    expect(h.calls).toEqual([]);
  });

  it("prepares Google eligibility with CSRF-protected POST, never DOB in URLs, and locks duplicate requests", async () => {
    const h = pageHarness("Register");
    registration(h);
    const pending = deferred();
    h.transport(() => pending.promise);
    const first = h.find("data-testid", "button-google-signup").props.onClick();
    h.render();
    await h.find("data-testid", "button-google-signup").props.onClick();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0][0]).toBe("/api/auth/google/signup");
    expect(h.calls[0][1].headers["x-csrf-token"]).toBe("unit-csrf");
    expect(JSON.parse(h.calls[0][1].body)).toEqual({ birthdate: "1990-06-15" });
    expect(h.authenticationCalls).toEqual([]); // This POST is eligibility, not completed auth.
    pending.resolve(json({ success: true }));
    await first; h.render();
    expect(h.location.href).toBe("/api/auth/google");
  });

  it("does not start Google OAuth if the server rejects eligibility", async () => {
    const h = pageHarness("Register");
    registration(h);
    h.transport(async () => json({ message: "You must be at least 16 years old to create an account" }, 400));
    await h.find("data-testid", "button-google-signup").props.onClick();
    h.render();
    expect(h.location.href).toBe("");
    expect(h.find("data-testid", "button-google-signup").props.disabled).toBe(false);
  });

  it("bootstraps CSRF for a fresh Google signup before posting eligibility", async () => {
    const h = pageHarness("Register");
    registration(h);
    h.csrf(null);
    h.transport(async (url) => url === "/api/csrf-token"
      ? json({ csrfToken: "signup-unit-csrf" }) : json({ success: true }));
    await h.find("data-testid", "button-google-signup").props.onClick();
    expect(h.calls.map(call => call[0])).toEqual(["/api/csrf-token", "/api/auth/google/signup"]);
    expect(h.calls[1][1].headers["x-csrf-token"]).toBe("signup-unit-csrf");
    expect(h.location.href).toBe("/api/auth/google");
  });

  it("waits for the auth check without exposing an active signup form", () => {
    const h = pageHarness("Register", "", true);
    expect(h.all().some(node => node.type === "form")).toBe(false);
  });

  it("does not label email validation/provider failures as duplicate accounts", async () => {
    const h = pageHarness("Register");
    registration(h);
    h.transport(async () => json({ message: "Invalid email format" }, 400));
    await h.submit(); h.render();
    expect(h.all().some(node => node.props?.id === "email-error")).toBe(false);
    h.transport(async () => json({ message: "Email already registered" }, 400));
    await h.submit(); h.render();
    expect(h.find("id", "email-error").props.children).toContain("This email is already registered");
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(2);
  });

  it("validates successful identity before navigation and delegates every registration exchange", async () => {
    const h = pageHarness("Register");
    registration(h);
    h.transport(async () => new Response("<html>Unavailable</html>", { status: 502 }));
    await h.submit(); h.render();
    expect(h.cache).toEqual([]);
    expect(h.find("data-testid", "button-create-account").props.disabled).toBe(false);
    h.transport(async () => json({ success: true }));
    await h.submit();
    expect(h.navigations).toEqual([]);
    h.transport(async () => json({ id: "registered-unit" }));
    await h.submit();
    expect(h.tokens).toEqual([]);
    expect(h.cache).toEqual([]);
    expect(h.authenticationCalls).toHaveLength(3);
    expect(h.authenticationCalls[2].exchange?.data).toEqual({ id: "registered-unit" });
    expect(JSON.parse(h.calls.at(-1)![1].body).birthdate).toBe("1990-06-15");
    expect(h.navigations).toEqual(["/dashboard"]);
  });

  it("locks duplicate submission and Google/terms controls while creating an account", async () => {
    const h = pageHarness("Register");
    registration(h);
    const pending = deferred();
    h.transport(() => pending.promise);
    const first = h.submit(); h.render();
    await h.submit();
    expect(h.calls).toHaveLength(1);
    expect(h.find("id", "terms").props.disabled).toBe(true);
    expect(h.find("data-testid", "button-google-signup").props.disabled).toBe(true);
    pending.resolve(json({ message: "Registration failed" }, 503));
    await first; h.render();
    expect(h.find("id", "terms").props.disabled).toBe(false);
  });
});

describe("Owned pages respect the shared authentication boundary", () => {
  it.each(["Login", "Register"])("%s uses only the provider auth gate, with no independent auth query or completion bypass", page => {
    const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
    expect(source).not.toMatch(/\b(?:setAuthToken|setQueryData|useQueryClient|useQuery|useRedirectIfAuthenticated)\b/);
    expect(source).not.toContain("/api/auth/me");
    expect(source).toMatch(/user:\s*authenticatedUser,\s*isLoading:\s*authLoading,\s*authenticate\s*}\s*=\s*useAuth\(\)/);
  });

  it.each(["Login", "Register"])("%s hides the submit form while the provider already owns an authenticated user", page => {
    const h = pageHarness(page, "", false, { id: "provider-owned-user" });
    expect(h.all().some(node => node.type === "form")).toBe(false);
    expect(h.calls).toEqual([]);
    expect(h.authenticationCalls).toEqual([]);
  });

  it.each(["Login", "Register"])("%s does not navigate or claim success if provider verification rejects", async page => {
    const h = pageHarness(page);
    if (page === "Register") registration(h);
    else { h.input("username", "artist"); h.input("password", "Password1!"); }
    h.transport(async () => json({ id: "unit-user" }));
    h.failAuthentication(new Error("The active session could not be verified. Please sign in again."));
    await h.submit(); h.render();
    expect(h.authenticationCalls).toHaveLength(1);
    expect(h.navigations).toEqual([]);
    expect(h.tokens).toEqual([]);
    expect(h.cache).toEqual([]);
    expect(h.toasts.some(toast => toast.title === "Welcome back!" || toast.title === "Account created successfully!")).toBe(false);
    if (page === "Register") {
      expect(h.all().some(node => node.props?.children === "The active session could not be verified. Please sign in again.")).toBe(true);
    } else {
      expect(h.toasts.at(-1).description).toMatch(/active session could not be verified/);
    }
  });
});

describe("Forgot/reset password page contracts", () => {
  it("forgot success is strict and privacy-preserving, resends cannot overlap or switch recipients in flight", async () => {
    const h = pageHarness("ForgotPassword");
    h.input("email", " unit@example.test ");
    h.transport(async () => json({ success: "true" }));
    await h.submit(); h.render();
    expect(h.all().some(node => node.type === "form")).toBe(true);
    h.transport(async () => json({ success: true }));
    await h.submit(); h.render();
    expect(JSON.parse(h.calls[1][1].body)).toEqual({ email: "unit@example.test" });
    expect(h.find("data-testid", "button-resend-email").props.disabled).toBe(true);
    expect(h.toasts.at(-1).description).toMatch(/If an account exists/);
    await h.find("data-testid", "button-resend-email").props.onClick();
    expect(h.calls).toHaveLength(2);
    h.elapseCooldown();
    const pending = deferred();
    h.transport(() => pending.promise);
    const resend = h.find("data-testid", "button-resend-email").props.onClick();
    h.render();
    await h.find("data-testid", "button-resend-email").props.onClick();
    expect(h.calls).toHaveLength(3);
    expect(h.find("data-testid", "button-try-different-email").props.disabled).toBe(true);
    pending.resolve(json({ success: true }));
    await resend; h.render();
    expect(h.find("data-testid", "button-resend-email").props.disabled).toBe(true);
  });

  it("forgot fails explicitly on provider rejection and blocks overlapping submit", async () => {
    const h = pageHarness("ForgotPassword");
    h.input("email", "unit@example.test");
    const pending = deferred();
    h.transport(() => pending.promise);
    const first = h.submit(); h.render();
    await h.submit();
    expect(h.calls).toHaveLength(1);
    pending.resolve(json({ message: "Unable to send the reset email right now." }, 503));
    await first; h.render();
    expect(h.find("data-testid", "button-send-reset-link").props.disabled).toBe(false);
    expect(h.toasts.at(-1).description).toMatch(/Unable to send/);
    expect(h.all().some(node => node.type === "form")).toBe(true);
  });

  it("reset without token never shows a submit form", () => {
    const h = pageHarness("ResetPassword");
    expect(h.all().some(node => node.type === "form")).toBe(false);
    expect(h.find("data-testid", "button-request-new-link")).toBeDefined();
  });

  it("enforces reset's backend 8–72 character bounds and requires positive success acknowledgement", async () => {
    const h = pageHarness("ResetPassword", "?token=unit-reset-token");
    h.input("password", "short"); h.input("confirmPassword", "short");
    await h.submit();
    expect(h.calls).toHaveLength(0);
    h.input("password", "x".repeat(73)); h.input("confirmPassword", "x".repeat(73));
    await h.submit(); h.render();
    expect(h.calls).toHaveLength(0);
    expect(h.find("id", "password").props["aria-invalid"]).toBe(true);
    h.input("password", "Password1!"); h.input("confirmPassword", "Password1!");
    h.transport(async () => json({}));
    await h.submit(); h.render();
    expect(h.all().some(node => node.type === "form")).toBe(true);
    expect(JSON.parse(h.calls[0][1].body)).toEqual({ token: "unit-reset-token", password: "Password1!" });
    h.transport(async () => json({ success: true }));
    await h.submit(); h.render();
    expect(h.find("data-testid", "button-go-to-login")).toBeDefined();
  });

  it("reset preserves invalid-or-expired ambiguity and retries only on explicit user action", async () => {
    const h = pageHarness("ResetPassword", "?token=unit-reset-token");
    h.input("password", "Password1!"); h.input("confirmPassword", "Password1!");
    h.transport(async () => json({ message: "Invalid or expired reset token" }, 400));
    await h.submit(); h.render();
    expect(h.calls).toHaveLength(1);
    expect(h.all().some(node => node.props?.children === "This password reset link is invalid or expired. Please request a new one.")).toBe(true);
    expect(h.find("data-testid", "button-reset-password").props.disabled).toBe(false);
  });

  it("reset locks concurrent requests, reports rate limiting, and recovers from a network failure", async () => {
    const h = pageHarness("ResetPassword", "?token=unit-reset-token");
    h.input("password", "Password1!"); h.input("confirmPassword", "Password1!");
    const pending = deferred();
    h.transport(() => pending.promise);
    const first = h.submit(); h.render();
    await h.submit();
    expect(h.calls).toHaveLength(1);
    expect(h.find("data-testid", "button-reset-password").props.disabled).toBe(true);
    pending.resolve(json({ message: "Too many requests" }, 429));
    await first; h.render();
    expect(h.all().some(node => node.props?.children === "Too many password reset attempts. Please wait a few minutes before trying again.")).toBe(true);
    h.transport(async () => { throw new Error("Unit simulated offline"); });
    await h.submit(); h.render();
    expect(h.find("data-testid", "button-reset-password").props.disabled).toBe(false);
    expect(h.all().some(node => node.props?.children === "Unable to connect to the server. Please check your internet connection and try again.")).toBe(true);
  });
});
