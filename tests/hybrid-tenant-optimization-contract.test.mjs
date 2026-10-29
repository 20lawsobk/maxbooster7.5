import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../server/services/hybridStorageService.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("hybridStorageService.ts", source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find((node) =>
  ts.isClassDeclaration(node) && node.name?.text === "HybridStorageService");
assert.ok(service, "committed HybridStorageService must exist");
const methods = ["tierDown", "runAutoTiering", "optimizeStorage"].map((name) => {
  const method = service.members.find((node) =>
    ts.isMethodDeclaration(node) && node.name?.getText(ast) === name);
  assert.ok(method, `committed ${name} must exist`);
  return method.getText(ast);
});
const javascript = ts.transpileModule(
  "class Harness {\n" + methods.join("\n") + "\n}\nglobalThis.Harness = Harness;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const context = vm.createContext({ Map, Date, Error, logger: { info() {}, warn() {} } });
vm.runInContext(javascript, context);
const { Harness } = context;

function makeHarness() {
  const h = new Harness();
  const alice = { key: "alice/file", userId: "alice", tier: "hot", location: "replit", isDeduplicated: false };
  const bob = { key: "bob/file", userId: "bob", tier: "hot", location: "replit", isDeduplicated: false };
  const alias = { key: "alice/alias", userId: "alice", tier: "hot", location: "replit", isDeduplicated: true };
  h.fileIndex = new Map([[alice.key, alice], [bob.key, bob], [alias.key, alias]]);
  h.initialize = async () => {};
  h.determineTier = () => ({ shouldTierDown: true, shouldTierUp: false });
  const calls = { saves: 0 };
  h.saveIndex = async () => { calls.saves++; };
  return { h, alice, bob, alias, calls };
}

describe("hybrid auto-tiering tenant isolation and failure rollback (committed methods)", () => {
  it("optimizing Alice must not tier or persist Bob's private file", async () => {
    const { h, alice, bob, calls } = makeHarness();
    const result = await h.optimizeStorage("alice");
    assert.equal(result.tieredDown, 1);
    assert.equal(result.tieredUp, 0);
    assert.equal(result.deduplicated, 0);
    assert.equal(alice.tier, "cold");
    assert.equal(bob.tier, "hot");
    assert.equal(bob.location, "replit");
    assert.equal(calls.saves, 1);
  });

  it("optimizing Bob must not tier or persist Alice's private file", async () => {
    const { h, alice, bob, calls } = makeHarness();
    const result = await h.optimizeStorage("bob");
    assert.equal(result.tieredDown, 1);
    assert.equal(bob.tier, "cold");
    assert.equal(alice.tier, "hot");
    assert.equal(calls.saves, 1);
  });

  it("direct scoped auto-tiering skips every other tenant", async () => {
    const { h, alice, bob, calls } = makeHarness();
    const result = await h.runAutoTiering("alice");
    assert.equal(result.tieredDown, 1);
    assert.equal(alice.tier, "cold");
    assert.equal(bob.tier, "hot");
    assert.equal(calls.saves, 1);
  });

  it("failed index persistence rolls back both tier and location", async () => {
    const { h, alice, calls } = makeHarness();
    h.saveIndex = async () => { calls.saves++; throw new Error("PDIM index outage"); };
    assert.equal(await h.tierDown(alice.key), false);
    assert.equal(alice.tier, "hot");
    assert.equal(alice.location, "replit");
    assert.equal(calls.saves, 1);
  });

  it("successful tier-down commits the supported PDIM/cold metadata", async () => {
    const { h, alice, calls } = makeHarness();
    assert.equal(await h.tierDown(alice.key), true);
    assert.equal(alice.tier, "cold");
    assert.equal(alice.location, "pocket-dimension");
    assert.equal(calls.saves, 1);
  });

  it("deduplicated aliases are not independently tiered", async () => {
    const { h, alias } = makeHarness();
    assert.equal(await h.tierDown(alias.key), false);
    assert.equal(alias.tier, "hot");
  });

  it("missing keys and already-cold primaries are no-ops", async () => {
    const { h, alice, calls } = makeHarness();
    assert.equal(await h.tierDown("missing"), false);
    alice.tier = "cold";
    assert.equal(await h.tierDown(alice.key), false);
    assert.equal(calls.saves, 0);
  });
});
