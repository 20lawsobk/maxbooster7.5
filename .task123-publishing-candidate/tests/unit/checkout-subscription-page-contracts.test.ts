import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as agePolicy from "../../shared/agePolicy";
import * as registrationCompletion from "../../client/src/lib/registrationCompletion";
import * as subscriptionCheckout from "../../client/src/lib/subscriptionCheckout";
import * as registrationCheckout from "../../client/src/lib/registrationCheckout";

// Execute real page handlers with isolated hooks and transport. No backend,
// browser SDK, credentials, account creation, or network is loaded.
function harness(page: string, options: { tier?: string; search?: string; user?: any; authLoading?: boolean; stripeKey?: boolean; form?: boolean } = {}) {
  const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8")
    .replace("import.meta.env.VITE_STRIPE_PUBLIC_KEY", options.stripeKey === false ? '""' : '"pk_unit"');
  const slots: any[] = [];
  let cursor = 0;
  let user = options.user ?? null;
  let authLoading = options.authLoading ?? false;
  let tier = options.tier ?? "monthly";
  let transport: (...args: any[]) => Promise<Response> = async () => { throw new Error("Unexpected unit transport"); };
  let confirm: () => Promise<any> = async () => ({ paymentIntent: { status: "succeeded" } });
  const calls: any[][] = [], toasts: any[] = [], navigations: string[] = [], exchanges: any[] = [];
  let authFailure: Error | undefined;
  const pending: (() => unknown)[] = [];
  const jsx = (type: any, props: any) => ({ type, props });
  const navigate = (path: string) => navigations.push(path);
  const toast = (data: any) => toasts.push(data);
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: any) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: initial });
    },
    useCallback(fn: any, deps: any[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useMemo(fn: () => any, deps: any[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useEffect(fn: any, deps: any[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        const entry = { deps, cleanup: undefined as any };
        slots[index] = entry;
        pending.push(() => { previous?.cleanup?.(); entry.cleanup = fn(); });
      }
    },
  };
  const location = { search: options.search ?? "", href: "", origin: "https://unit.example.test" };
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true, fileName: `${page}.tsx`,
  });
  expect(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
  vm.runInNewContext(compiled.outputText + (options.form ? "\nexports.Form = SubscribeForm;" : ""), {
    exports, URL, URLSearchParams, Date, Error, Map,
    crypto: { randomUUID: (() => { let n = 0; return () => `unit-idempotency-key-${++n}`; })() },
    window: { location },
    require(id: string) {
      if (id === "react") return hooks;
      if (id.endsWith("/agePolicy")) return agePolicy;
      if (id.endsWith("/registrationCompletion")) return registrationCompletion;
      if (id.endsWith("/subscriptionCheckout")) return subscriptionCheckout;
      if (id.endsWith("/registrationCheckout")) return registrationCheckout;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (id === "wouter") return { Link: "Link", useLocation: () => ["", navigate], useParams: () => ({ tier }) };
      if (id.endsWith("/useAuth")) return { useAuth: () => ({
        user, isLoading: authLoading,
        authenticate: async (operation: any) => {
          const result = await operation();
          exchanges.push(result);
          if (authFailure) throw authFailure;
          return result;
        },
      }) };
      if (id.endsWith("/use-toast")) return { useToast: () => ({ toast }) };
      if (id.endsWith("/queryClient")) return {
        apiRequest: async (...args: any[]) => { calls.push(args); return transport(...args); },
        ApiError: class ApiError extends Error {},
      };
      if (id === "@stripe/stripe-js") return { loadStripe: () => Promise.resolve({}) };
      if (id === "@stripe/react-stripe-js") return {
        Elements: "Elements", PaymentElement: "PaymentElement",
        useStripe: () => ({ confirmPayment: () => confirm() }), useElements: () => ({}),
      };
      return new Proxy({}, { get: (_, name) => String(name) });
    },
  });
  let tree: any;
  function render() {
    cursor = 0;
    tree = options.form ? exports.Form({ plan: { id: "yearly", name: "Yearly Plan", price: 468, period: "year" } }) : exports.default();
    while (pending.length) pending.shift()!();
    return tree;
  }
  function all(node: any): any[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(child => all(child));
    return [node, ...all(node.props?.children)];
  }
  function find(key: string, value: any) {
    const node = all(tree).find(node => node.props?.[key] === value);
    if (!node) throw new Error(`Missing ${key}=${value}`);
    return node;
  }
  function input(id: string, value: string) { find("id", id).props.onChange({ target: { name: id, value } }); render(); }
  async function settle() { await new Promise(done => setImmediate(done)); render(); }
  function submit() {
    const form = all(tree).find(node => node.type === "form");
    if (!form) throw new Error("Missing form");
    return form.props.onSubmit({ preventDefault() {} });
  }
  render();
  return {
    render, all: () => all(tree), find, input, settle, submit, calls, toasts, navigations, location, exchanges,
    text: () => JSON.stringify(tree),
    transport(fn: typeof transport) { transport = fn; },
    confirm(fn: typeof confirm) { confirm = fn; },
    authFailure(error: Error) { authFailure = error; },
    identity(value: any, loading = false) { user = value; authLoading = loading; render(); },
    tier(value: string) { tier = value; render(); },
  };
}
const json = (data: any) => new Response(JSON.stringify(data));
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function details(h: ReturnType<typeof harness>, overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ username: " artist_1 ", email: " unit@example.test ", birthdate: "1990-01-01", ...overrides })) h.input(key, value);
}
async function verified() {
  // Verification begins in the effect; provide its result without provider IO.
  const h = harness("RegisterSuccess", { search: "?session_id=cs_unit" , authLoading: true });
  h.transport(async () => json({ verified: true }));
  h.identity(null);
  await h.settle();
  return h;
}
function passwords(h: ReturnType<typeof harness>, value = "Password1!") {
  h.input("password", value); h.input("confirmPassword", value);
  h.find("id", "tosAccepted").props.onCheckedChange(true);
  h.find("id", "privacyAccepted").props.onCheckedChange(true);
  h.render();
}

describe("Registration checkout page", () => {
  it.each(["unknown", "constructor", "__proto__"])("rejects invalid/inherited tier %s without requests", tier => {
    const h = harness("RegisterPayment", { tier });
    expect(h.text()).toContain("Plan Not Found"); expect(h.calls).toEqual([]);
  });
  it.each(["monthly", "yearly", "lifetime"])("displays canonical %s billing and 90-day guarantee", tier => {
    const h = harness("RegisterPayment", { tier });
    expect(h.text()).toContain(tier === "monthly" ? "49" : tier === "yearly" ? "468" : "699");
    expect(h.text()).toContain("90-Day Money-Back Guarantee");
    if (tier === "yearly") expect(h.text()).toContain("$39/month equivalent");
  });
  it.each([
    { username: "x" }, { username: "bad name" }, { email: "a@b" },
    { birthdate: "not-a-date" }, { birthdate: "2000-02-31" }, { birthdate: "2999-01-01" }, { birthdate: "2020-01-01" },
  ])("blocks invalid details before creating checkout: %j", async override => {
    const h = harness("RegisterPayment"); details(h, override);
    await h.submit(); h.render();
    expect(h.calls).toEqual([]); expect(h.all().some(n => n.props?.role === "alert")).toBe(true);
  });
  it("normalizes input and prevents duplicate checkout submissions", async () => {
    const h = harness("RegisterPayment"); details(h);
    const request = deferred(); h.transport(() => request.promise);
    const first = h.submit(); const second = h.submit();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0][2]).toMatchObject({ userEmail: "unit@example.test", username: "artist_1", tier: "monthly" });
    request.resolve(json({ url: "https://checkout.stripe.com/c/pay/unit" }));
    await Promise.all([first, second]);
    expect(h.location.href).toBe("https://checkout.stripe.com/c/pay/unit");
  });
  it("does not navigate to an untrusted or missing provider URL and allows retry", async () => {
    const h = harness("RegisterPayment"); details(h);
    h.transport(async () => json({ url: "https://checkout.stripe.com.evil.test/pay" }));
    await h.submit(); h.render();
    expect(h.location.href).toBe(""); expect(h.text()).toContain("checkout");
    h.transport(async () => json({}));
    await h.submit(); expect(h.calls).toHaveLength(2);
  });
});

describe("Registration success page", () => {
  it("shows recoverable missing-session guidance without payment claims", () => {
    const h = harness("RegisterSuccess"); h.render();
    expect(h.calls).toEqual([]); expect(h.text()).toContain("No valid payment session");
    expect(h.text()).not.toContain("Payment Successful!");
  });
  it("requires explicit verified:true, then permits manual verification retry", async () => {
    const h = harness("RegisterSuccess", { search: "?session_id=cs_unit", authLoading: true });
    h.transport(async () => json({})); h.identity(null); await h.settle();
    expect(h.text()).not.toContain("Payment Successful!");
    expect(h.text()).toContain("Payment could not be verified");
    const retry = h.all().find(n => n.props?.children === "Retry Verification");
    h.transport(async () => json({ verified: true }));
    retry.props.onClick(); h.render(); await h.settle();
    expect(h.text()).toContain("Payment Verified"); expect(h.calls).toHaveLength(2);
  });
  it("matches the server's eight-character password minimum", async () => {
    const h = await verified(); passwords(h, "short12");
    await h.submit(); h.render();
    expect(h.calls).toHaveLength(1); expect(h.text()).toContain("at least 8");
    expect(h.find("id", "password").props.minLength).toBe(8);
  });
  it("uses the auth boundary only for actual registration, adapting the nested user id", async () => {
    const h = await verified(); passwords(h);
    const request = deferred(); h.transport(() => request.promise);
    const first = h.submit(), second = h.submit();
    expect(h.calls).toHaveLength(2);
    request.resolve(json({ user: { id: "unit-user" }, consentRecorded: true }));
    await Promise.all([first, second]);
    expect(h.exchanges).toHaveLength(1);
    expect(h.exchanges[0].data.id).toBe("unit-user");
    expect(h.navigations).toContain("/dashboard");
  });
  it("does not claim account success if boundary verification fails", async () => {
    const h = await verified(); passwords(h);
    h.transport(async () => json({ user: { id: "unit-user" }, consentRecorded: true }));
    h.authFailure(new Error("The active session could not be verified. Please sign in again."));
    await h.submit(); h.render();
    expect(h.navigations).toEqual([]);
    expect(h.text()).toContain("active session could not be verified");
    expect(h.toasts.some(t => t.title === "Welcome to Max Booster!")).toBe(false);
  });
});

describe("Authenticated subscription page", () => {
  it("waits for authentication and does not create an intent without Stripe configuration", async () => {
    const h = harness("Subscribe", { authLoading: true });
    expect(h.calls).toEqual([]); expect(h.navigations).toEqual([]);
    h.identity(null); expect(h.navigations[0]).toContain("redirect=%2Fsubscribe%2Fmonthly");
    const noKey = harness("Subscribe", { user: { id: "unit" }, stripeKey: false });
    await noKey.settle(); expect(noKey.calls).toEqual([]);
  });
  it("deduplicates setup, preserves the key on retry, and rejects a missing client secret", async () => {
    const h = harness("Subscribe", { authLoading: true });
    h.transport(async () => { throw new Error("Temporary failure"); });
    h.identity({ id: "unit" }); await h.settle();
    const key = h.calls[0][3].headers["Idempotency-Key"];
    h.transport(async () => json({}));
    h.all().find(n => n.props?.children?.some?.((c: any) => c === "Try Again")).props.onClick();
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1][3].headers["Idempotency-Key"]).toBe(key);
    expect(h.text()).toContain("usable checkout session");
  });
  it("ignores a late old-tier response and keys Elements to the current checkout", async () => {
    const h = harness("Subscribe", { authLoading: true });
    const old = deferred();
    h.transport((_method, _path, body) => body.planName === "monthly" ? old.promise : Promise.resolve(json({ clientSecret: "yearly_secret_unit" })));
    h.identity({ id: "unit" }); h.tier("yearly"); await h.settle();
    expect(h.text()).toContain("yearly_secret_unit");
    old.resolve(json({ clientSecret: "monthly_secret_unit" })); await h.settle();
    expect(h.text()).not.toContain("monthly_secret_unit");
    expect(h.text()).toContain("90-Day Money-Back Guarantee");
    expect(h.calls[0][3].headers["Idempotency-Key"]).not.toBe(h.calls[1][3].headers["Idempotency-Key"]);
  });
  it("keeps card retries on the same intent, prevents duplicate confirmation, and handles unknown outcomes", async () => {
    const h = harness("Subscribe", { form: true });
    h.all().find(n => n.type === "PaymentElement").props.onReady(); h.render();
    let confirms = 0;
    let resolve!: (value: any) => void;
    h.confirm(() => { confirms++; return new Promise(done => { resolve = done; }); });
    const first = h.submit(), second = h.submit(); expect(confirms).toBe(1);
    resolve({ paymentIntent: { status: "requires_payment_method" } }); await Promise.all([first, second]); h.render();
    expect(h.text()).toContain("Payment was not confirmed");
    expect(h.calls).toEqual([]); expect(h.navigations).toEqual([]);
    expect(h.text()).toContain("Subscribe for $468/year");
  });
});
