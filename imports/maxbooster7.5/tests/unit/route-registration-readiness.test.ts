import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Run the actual registration functions in isolation from DB/provider imports.
const source = ts.createSourceFile("server/routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
const loaderSource = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "safeLoadRoute")!.getText(source);
let mountSource = "";
function visit(node: ts.Node): void {
  if (ts.isForStatement(node) && node.getText(source).includes("const result = loadedModules[i]")) {
    mountSource = node.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);

async function harness() {
  const state = await import("../../server/lib/bootState");
  const context = {
    recordRouteRegistrationFailure: state.recordRouteRegistrationFailure,
    log() {}, logger: { warn() {}, error() {} },
  };
  const load = vm.runInNewContext(ts.transpile(`${loaderSource}; safeLoadRoute;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), context) as (name: string, loader: () => Promise<unknown>) => Promise<unknown>;
  async function mount(name: string, value: unknown, use: () => void = () => {}) {
    await vm.runInNewContext(ts.transpile(`(async () => { ${mountSource} })()`, {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
    }), { ...context, routeModules: [{ name, path: "/test" }], loadedModules: [value], app: { use } });
  }
  return { ...state, load, mount };
}

beforeEach(() => vi.resetModules());

describe("critical route registration readiness", () => {
  it("distinguishes boot completion from a failed critical import", async () => {
    const h = await harness();
    expect(h.routeRegistrationReadiness().status).toBe("degraded");
    expect(await h.load("billing", async () => { throw new Error("synthetic credential detail"); })).toBeNull();
    h.setRoutesReady();
    expect(h.isRoutesReady()).toBe(true);
    expect(h.routeRegistrationReadiness()).toEqual({ status: "degraded", detail: "critical route registration failed: billing" });
  });

  it("does not introduce an optional-route readiness requirement", async () => {
    const h = await harness();
    await h.load("optionalExample", async () => { throw new Error("not configured"); });
    h.setRoutesReady();
    expect(h.routeRegistrationReadiness().status).toBe("ok");
  });

  it("rejects a critical module with no usable export", async () => {
    const h = await harness();
    await h.load("auth", async () => ({}));
    h.setRoutesReady();
    expect(h.routeRegistrationReadiness().detail).toContain("auth");
    expect(h.routeRegistrationReadiness().status).toBe("degraded");
  });

  it("registers a valid router without reporting a failure", async () => {
    const h = await harness();
    const router = Object.assign(() => {}, { stack: [] });
    await h.mount("billing", await h.load("billing", async () => ({ default: router })));
    h.setRoutesReady();
    expect(h.routeRegistrationReadiness().status).toBe("ok");
  });

  it("retains a critical Express mount failure", async () => {
    const h = await harness();
    await h.mount("storage", { type: "router", value: () => {} }, () => { throw new Error("mount failure"); });
    h.setRoutesReady();
    expect(h.routeRegistrationReadiness()).toEqual({ status: "degraded", detail: "critical route registration failed: storage" });
  });

  it("retains synchronous and asynchronous critical setup failures", async () => {
    const h = await harness();
    await h.mount("admin", { type: "function", value: () => { throw new Error("sync failure"); } });
    await h.mount("security", { type: "function", value: async () => { throw new Error("async failure"); } });
    h.setRoutesReady();
    expect(h.routeRegistrationReadiness()).toEqual({ status: "degraded", detail: "critical route registration failed: admin, security" });
  });
});
