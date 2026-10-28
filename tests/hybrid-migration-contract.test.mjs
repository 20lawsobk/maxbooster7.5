import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const migration = service.members.find((node) =>
  ts.isMethodDeclaration(node) && node.name?.getText(ast) === "migrateFile");
assert.ok(migration, "committed migrateFile method must exist");
const javascript = ts.transpileModule(
  "class Harness {\n" + migration.getText(ast) + "\n}\nglobalThis.Harness = Harness;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const context = vm.createContext({ Map, Buffer, Date, Error, logger: { info() {}, warn() {} } });
vm.runInContext(javascript, context);
const { Harness } = context;
const data = Buffer.from("migration source integrity fixture");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function makeHarness() {
  const h = new Harness();
  const calls = { init: 0, reads: 0, writes: 0, saves: 0 };
  const entry = {
    key: "alice/file", userId: "alice", isDeduplicated: false,
    location: "replit", tier: "hot", compressedSize: 7, contentHash: sha256(data),
  };
  h.fileIndex = new Map([[entry.key, entry]]);
  h.initialize = async () => { calls.init++; };
  h.readFromStorage = async () => { calls.reads++; return data; };
  h.computeContentHash = sha256;
  h.coldPocket = { write: async () => { calls.writes++; return { compressedSize: 19 }; } };
  h.saveIndex = async () => { calls.saves++; };
  return { h, calls, entry };
}

describe("hybrid migration fail-closed contract (actual committed method)", () => {
  it("rejects an unsupported hot tier before initialization or I/O", async () => {
    const { h, calls } = makeHarness();
    assert.equal(await h.migrateFile("alice", "alice/file", "hot", "pocket-dimension"), false);
    assert.deepEqual(calls, { init: 0, reads: 0, writes: 0, saves: 0 });
  });
  it("rejects an unsupported Replit destination before initialization or I/O", async () => {
    const { h, calls } = makeHarness();
    assert.equal(await h.migrateFile("alice", "alice/file", "cold", "replit"), false);
    assert.deepEqual(calls, { init: 0, reads: 0, writes: 0, saves: 0 });
  });
  it("acknowledges a genuine no-op for already cold PDIM metadata", async () => {
    const { h, calls, entry } = makeHarness();
    entry.tier = "cold"; entry.location = "pocket-dimension";
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), true);
    assert.equal(calls.writes, 0);
    assert.equal(calls.saves, 0);
  });
  it("verifies source bytes before committing a real legacy metadata transition", async () => {
    const { h, calls, entry } = makeHarness();
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), true);
    assert.equal(entry.location, "pocket-dimension");
    assert.equal(entry.tier, "cold");
    assert.equal(entry.compressedSize, 19);
    assert.deepEqual(calls, { init: 1, reads: 1, writes: 1, saves: 1 });
  });
  it("rejects corrupt source bytes before writing or changing metadata", async () => {
    const { h, calls, entry } = makeHarness();
    h.readFromStorage = async () => { calls.reads++; return Buffer.from("corrupt"); };
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), false);
    assert.equal(entry.location, "replit");
    assert.equal(entry.tier, "hot");
    assert.equal(entry.compressedSize, 7);
    assert.equal(calls.writes, 0);
    assert.equal(calls.saves, 0);
  });
  it("rolls back in-memory metadata when index persistence fails", async () => {
    const { h, calls, entry } = makeHarness();
    h.saveIndex = async () => { calls.saves++; throw new Error("PDIM index outage"); };
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), false);
    assert.equal(entry.location, "replit");
    assert.equal(entry.tier, "hot");
    assert.equal(entry.compressedSize, 7);
    assert.equal(calls.writes, 1);
    assert.equal(calls.saves, 1);
  });
  it("does not change metadata when the physical write fails", async () => {
    const { h, calls, entry } = makeHarness();
    h.coldPocket.write = async () => { calls.writes++; throw new Error("PDIM write outage"); };
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), false);
    assert.equal(entry.location, "replit");
    assert.equal(entry.compressedSize, 7);
    assert.equal(calls.saves, 0);
  });
  it("rejects cross-owner migration and does not read bytes", async () => {
    const { h, calls, entry } = makeHarness();
    await assert.rejects(h.migrateFile("bob", entry.key, "cold", "pocket-dimension"), /Access denied/);
    assert.equal(calls.reads, 0);
  });
  it("refuses missing and deduplicated aliases without writing", async () => {
    const { h, calls, entry } = makeHarness();
    assert.equal(await h.migrateFile("alice", "missing", "cold", "pocket-dimension"), false);
    entry.isDeduplicated = true;
    assert.equal(await h.migrateFile("alice", entry.key, "cold", "pocket-dimension"), false);
    assert.equal(calls.writes, 0);
  });
  it("API route rejects unsupported targets before metadata lookup", () => {
    const routes = readFileSync(new URL("../server/routes/hybridStorage.ts", import.meta.url), "utf8");
    const begin = routes.indexOf('router.post("/migrate"');
    const end = routes.indexOf('router.get("/analytics"', begin);
    assert.ok(begin >= 0 && end > begin);
    const handler = routes.slice(begin, end);
    const guard = handler.indexOf('targetTier !== "cold" || targetLocation !== "pocket-dimension"');
    const lookup = handler.indexOf("getMetadata(fileKey)");
    assert.ok(guard >= 0 && lookup > guard, "unsupported destination must be rejected before metadata access");
    assert.match(handler, /status\(400\).*Unsupported hybrid storage migration target/);
  });
});
