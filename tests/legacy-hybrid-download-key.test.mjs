import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Executes the actual committed TypeScript download handler with mocked
// storage. It does NOT replace two-account HTTP/PDIM integration.
const source = readFileSync(new URL("../server/routes/hybridStorage.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("hybridStorage.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handler;
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === "router" &&
      node.expression.name.text === "get" && node.arguments[0]?.text === "/file/:fileKey") {
    assert.equal(handler, undefined, "duplicate hybrid download route");
    handler = node.arguments[2];
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(handler && ts.isArrowFunction(handler), "hybrid download handler missing");
const compiled = ts.transpileModule("globalThis.__handler = " + handler.getText(parsed) + ";", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, "handler transpilation diagnostics");

async function exercise(fileKey, { requester = "owner-a", metadataOwner = "owner-a", failure = false } = {}) {
  const calls = [];
  const bytes = Buffer.from("exact owner bytes");
  const sandbox = {
    hybridStorageService: {
      getMetadata(key) {
        calls.push(["metadata", key]);
        return metadataOwner === null ? undefined : {
          userId: metadataOwner, mimeType: "audio/wav",
          originalName: "mix.wav", tier: "cold", location: "pocket-dimension",
        };
      },
      async read(user, key) {
        calls.push(["read", user, key]);
        if (failure) throw new Error("PDIM read failed");
        return bytes;
      },
    },
    logger: { warn() {} },
  };
  vm.runInNewContext(compiled.outputText, sandbox);
  const response = {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
  };
  await sandbox.__handler({ user: { id: requester }, params: { fileKey } }, response);
  return { response, calls, bytes };
}

test("owner downloads exact once-decoded key with private no-store response", async () => {
  const { response, calls, bytes } = await exercise("mix%2Fversion.wav");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [["metadata", "mix%2Fversion.wav"], ["read", "owner-a", "mix%2Fversion.wav"]]);
  assert.equal(response.body, bytes);
  assert.equal(response.headers["cache-control"], "private, no-store");
});

test("literal percent in a valid key remains valid", async () => {
  const { response, calls } = await exercise("100%-mix.wav");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls[0], ["metadata", "100%-mix.wav"]);
});

test("traversal, absolute, backslash, NUL, empty and missing keys fail before metadata", async () => {
  for (const fileKey of ["../secret", "/absolute", "folder\\secret", "a\0b", "", undefined]) {
    const { response, calls } = await exercise(fileKey);
    assert.equal(response.statusCode, 400, String(fileKey));
    assert.deepEqual(calls, [], String(fileKey));
  }
});

test("other account cannot fetch owner bytes", async () => {
  const { response, calls } = await exercise("private.wav", { requester: "other" });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(calls, [["metadata", "private.wav"]]);
});

test("missing metadata does not fetch bytes", async () => {
  const { response, calls } = await exercise("missing.wav", { metadataOwner: null });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(calls, [["metadata", "missing.wav"]]);
});

test("PDIM read errors never return successful bytes", async () => {
  const { response, calls } = await exercise("private.wav", { failure: true });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(calls.at(-1), ["read", "owner-a", "private.wav"]);
});
