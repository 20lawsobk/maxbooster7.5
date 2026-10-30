/** Exact imported API -> Python planned-route classification and transport behavior.
 * Executes real retained proxy/normalization/auth/lifetime functions; HTTP I/O and
 * recovery state are controlled fixtures. No app startup or provider is used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import ts from "typescript";
import { PLANNED_GENERATION_DEADLINES, plannedGenerationDeadlineMs } from "../../external/maxcore/artifacts/api-server/src/config/planned-generation-policy.js";
import { modelAuthHeaders, modelOwnedBody } from "../../external/maxcore/artifacts/api-server/src/config/model-auth.js";
import { proxyLifetime } from "../../external/maxcore/artifacts/api-server/src/config/proxy-lifecycle.js";

type Planned = { path: string; handler: string; modality: string; options: Record<string, boolean> };
const pythonSource = "external/maxcore/artifacts/ai-training-server/server.py";
const planned: Planned[] = JSON.parse(execFileSync("python3", ["-I", "-B", "-c", `
import ast,json,sys
rows=[]
for n in ast.parse(open(sys.argv[1]).read()).body:
 if not isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):continue
 planned=[d for d in n.decorator_list if isinstance(d,ast.Call) and isinstance(d.func,ast.Name) and d.func.id=='_planned_generation']
 if not planned:continue
 for d in n.decorator_list:
  if isinstance(d,ast.Call) and isinstance(d.func,ast.Attribute) and isinstance(d.func.value,ast.Name) and d.func.value.id=='app' and d.args and isinstance(d.args[0],ast.Constant):
   rows.append({'path':d.args[0].value,'handler':n.name,'modality':ast.literal_eval(planned[0].args[0]),'options':{k.arg:ast.literal_eval(k.value) for k in planned[0].keywords}})
print(json.dumps(rows))
`, pythonSource], { encoding: "utf8", env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1" } }));

const sourcePath = "external/maxcore/artifacts/api-server/src/routes/model-proxy.ts";
const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, "utf8"), ts.ScriptTarget.Latest, true);
const names = new Set(["_resolveUserId", "normalizeBody", "parseBodyText", "handleProxyNetworkError", "proxyRequest"]);
const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ""));
const functions = declarations.map(node => node.getText(source)).join("\n");
type Forward = { publicPath: string; target: string; registration: string };
const forwards: Forward[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === "router" && ["get", "post"].includes(node.expression.name.text)
      && ts.isStringLiteral(node.arguments[0])) {
    const publicPath = "/api" + node.arguments[0].text;
    const find = (child: ts.Node) => {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "proxyRequest"
          && child.arguments.length === 3 && ts.isStringLiteral(child.arguments[2])) {
        forwards.push({ publicPath, target: child.arguments[2].text, registration: node.getText(source) });
      }
      ts.forEachChild(child, find);
    };
    ts.forEachChild(node, find);
  }
  ts.forEachChild(node, visit);
}
source.statements.forEach(visit);
const plannedPaths = new Set(planned.map(row => row.path));
const joined = forwards.filter(row => plannedPaths.has(row.target));
const uniqueTargets = [...new Set(joined.map(row => row.target))];

afterEach(() => vi.useRealTimers());
function fixture({ restarting = false, breaker = false, bodyStalls = false, transportError = false } = {}) {
  const success = vi.fn(), failure = vi.fn();
  const send = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
    if (transportError) throw Object.assign(new Error("Owned connection refused"), { code: "ECONNREFUSED" });
    return { statusCode: bodyStalls ? 200 : 503, body: { text: () => bodyStalls
      ? new Promise<string>((_resolve, reject) => {
          const abort = () => { init.signal.removeEventListener("abort", abort); reject(init.signal.reason); };
          init.signal.addEventListener("abort", abort, { once: true });
          if (init.signal.aborted) abort();
        })
      : Promise.resolve(JSON.stringify({ detail: "Owned actual-capability503", snapshot_id: "public-snapshot" })) } };
  });
  const safeRead = vi.fn();
  const recovery = vi.fn(async () => { throw new Error("Owned recovery hold invoked"); });
  const scope = {
    modelAuthHeaders: (headers: Parameters<typeof modelAuthHeaders>[0], peer: string) => modelAuthHeaders(headers, peer, "owned-private-channel"),
    modelOwnedBody, proxyLifetime, plannedGenerationDeadlineMs, MODEL_API_BASE: "http://owned-upstream.invalid",
    REQUEST_HOLD_MS: 90_000, _keepAlivePool: {}, _cbIsOpen: () => breaker,
    isPythonRestarting: () => restarting, waitForRecovery: recovery,
    undiciRequest: send, _upstreamRequest: safeRead, _cbRecordSuccess: success, _cbRecordFailure: failure,
    recordRequest: vi.fn(), recordLatency: vi.fn(), Date, console: { error() {} },
  };
  const context = vm.createContext(scope);
  vm.runInContext(ts.transpile(functions + "\n;globalThis.invokeProxy=proxyRequest;", { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const invoke = (context as unknown as { invokeProxy: (req: unknown, res: unknown, path: string) => Promise<void> }).invokeProxy;
  const request = (auth = true) => Object.assign(new EventEmitter(), {
    method: "POST", path: "/owned-input", socket: { remoteAddress: "127.0.0.1" }, aborted: false,
    headers: auth ? { authorization: "Bearer owned-private-channel", "x-maxcore-user-id": "actual-owner" } : {},
    body: { topic: "Literal caller topic", userId: "body-spoof", owner_id: "body-spoof",
      awareness: { snapshot_id: "public-snapshot", awareness: "Public live context" } },
  });
  const response = () => Object.assign(new EventEmitter(), {
    destroyed: false, headersSent: false, writableEnded: false, statusCode: 200, payload: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.payload = value; this.writableEnded = true; return this; },
    setHeader: vi.fn(), destroy() { this.destroyed = true; },
  });
  return { invoke, context, request, response, send, safeRead, recovery, success, failure };
}

describe("planned route inventory is exact and complete", () => {
  it("joins actual Python decorator AST and imported API forwarding targets without missing a planned contract", () => {
    expect(declarations.length).toBe(names.size);
    expect(new Set(planned.map(row => row.path)).size).toBe(planned.length);
    expect(Object.keys(PLANNED_GENERATION_DEADLINES).sort()).toEqual([...plannedPaths].sort());
    expect(joined.length).toBeGreaterThan(20);
    for (const row of joined) expect(plannedGenerationDeadlineMs(row.target)).toBeGreaterThan(0);
    // Public spellings intentionally map to existing Python handlers; do not
    // add duplicate Python aliases merely because these spellings differ.
    expect(forwards.find(row => row.publicPath === "/api/content/generate")?.target).toBe("/content/generate");
    expect(forwards.find(row => row.publicPath === "/api/generate/video")?.target).toBe("/api/video/generate-ai");
  });
  it("uses explicit real render/specification budgets and preserves long legacy DAW/video budgets", () => {
    for (const row of planned) {
      const media = row.options.dedicated_media || row.modality === "video" && !row.options.specification
        || ["/platform/daw/generate", "/platform/video/generate"].includes(row.path);
      expect(plannedGenerationDeadlineMs(row.path, {}), row.path).toBe(media ? 600_000 : 60_000);
      if (row.options.deterministic_planner) expect(plannedGenerationDeadlineMs(row.path, { mode: "planner" })).toBe(30_000);
    }
  });
  it("does not exempt unknown/admin prefix lookalikes or inherited property names", () => {
    for (const path of ["/api/generate/unknown", "/platform/social/generate/extra", "/training/start", "/api-keys", "toString", "__proto__"]) {
      expect(plannedGenerationDeadlineMs(path, { mode: "planner" }), path).toBeUndefined();
    }
  });
});

describe("actual proxy respects authoritative Python generation during recovery", () => {
  for (const target of uniqueTargets) {
    for (const outage of ["restart", "breaker"] as const) {
      it(`${target} reaches Python and preserves its503 during ${outage}`, async () => {
        vi.useFakeTimers();
        const f = fixture({ restarting: outage === "restart", breaker: outage === "breaker" });
        const req = f.request(), res = f.response();
        await f.invoke(req, res, target);
        expect(f.recovery).not.toHaveBeenCalled(); expect(f.safeRead).not.toHaveBeenCalled();
        expect(f.send).toHaveBeenCalledOnce();
        expect(f.send.mock.calls[0][0]).toBe("http://owned-upstream.invalid" + target);
        const init = f.send.mock.calls[0][1] as unknown as { headers: Record<string, string>; body: string; headersTimeout: number; bodyTimeout: number; signal: AbortSignal };
        expect(init.headers).toMatchObject({ Authorization: "Bearer owned-private-channel", "X-MaxCore-User-Id": "actual-owner" });
        expect(JSON.parse(init.body)).toMatchObject({ user_id: "actual-owner", userId: "actual-owner", owner_id: "actual-owner", awareness: req.body.awareness });
        expect(init.headersTimeout).toBe(plannedGenerationDeadlineMs(target)); expect(init.bodyTimeout).toBe(init.headersTimeout);
        expect(res.statusCode).toBe(503); expect(res.payload).toEqual({ detail: "Owned actual-capability503", snapshot_id: "public-snapshot" });
        expect(f.failure).not.toHaveBeenCalled(); expect(f.success).toHaveBeenCalledOnce();
        expect(req.listenerCount("aborted")).toBe(0); expect(res.listenerCount("close")).toBe(0); expect(vi.getTimerCount()).toBe(0);
      });
    }
  }
  it("actual public route normalizers still bind aliases/owner before dispatch", async () => {
    const selected = ["/api/content/generate", "/api/platform/social/generate", "/api/platform/ads/generate", "/api/generate/video"];
    const f = fixture({ restarting: true });
    const handlers = new Map<string, (req: unknown, res: unknown) => Promise<void>>();
    Object.assign(f.context, { router: { post(path: string, handler: (req: unknown, res: unknown) => Promise<void>) { handlers.set("/api" + path, handler); } } });
    for (const path of selected) {
      const route = forwards.find(row => row.publicPath === path);
      expect(route, path).toBeDefined();
      vm.runInContext(ts.transpile(route!.registration, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), f.context);
      const req = f.request(), res = f.response();
      await handlers.get(path)!(req, res);
      expect(res.statusCode).toBe(503); expect(f.send.mock.calls.at(-1)?.[0]).toBe("http://owned-upstream.invalid" + route!.target);
      expect(JSON.parse((f.send.mock.calls.at(-1)?.[1] as unknown as { body: string }).body)).toMatchObject({ user_id: "actual-owner", awareness: req.body.awareness });
    }
    expect(f.recovery).not.toHaveBeenCalled(); expect(f.failure).not.toHaveBeenCalled();
  });
  it("keeps unrelated routes in the recovery hold and rejects missing auth before dispatch", async () => {
    const f = fixture({ restarting: true });
    const held = f.response(); await f.invoke(f.request(), held, "/model/status");
    expect(f.recovery).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled();
    const denied = f.response(); await f.invoke(f.request(false), denied, "/content/generate");
    expect(denied.statusCode).toBe(401); expect(f.send).not.toHaveBeenCalled();
  });
  it("retains actual transport failures as503 without retrying a generation mutation", async () => {
    const f = fixture({ transportError: true }); const res = f.response();
    await f.invoke(f.request(), res, "/platform/social/generate");
    expect(res.statusCode).toBe(503); expect(f.failure).toHaveBeenCalledOnce();
    expect(f.send).toHaveBeenCalledOnce(); expect(f.safeRead).not.toHaveBeenCalled(); expect(f.success).not.toHaveBeenCalled();
  });
  it("retains deadline ownership through a stalled response body and releases timers/listeners", async () => {
    vi.useFakeTimers();
    const f = fixture({ bodyStalls: true }), req = f.request(), res = f.response();
    const pending = f.invoke(req, res, "/platform/social/generate");
    await vi.advanceTimersByTimeAsync(60_000); await pending;
    expect(res.statusCode).toBe(504); expect(f.send).toHaveBeenCalledOnce(); expect(f.failure).toHaveBeenCalledOnce();
    expect(req.listenerCount("aborted")).toBe(0); expect(res.listenerCount("close")).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
