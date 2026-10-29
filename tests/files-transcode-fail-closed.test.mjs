import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the committed route callbacks in isolation. These tests do not
// substitute for real authenticated HTTP, storage, or worker integration.
const source = readFileSync(new URL("../server/routes/files.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("files.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function route(method, path) {
  const matches = [];
  function visit(node) {
    if (ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(parsed) === "router" &&
        node.expression.name.text === method &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === path) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(matches.length, 1, `expected one ${method.toUpperCase()} ${path} route`);
  return matches[0];
}

const startRoute = route("post", "/:id/transcode");
const statusRoute = route("get", "/transcode/:jobId/status");

function compileHandler(routeNode, file) {
  const callback = routeNode.arguments.at(-1);
  assert.ok(ts.isArrowFunction(callback), "expected inline route callback");
  const js = ts.transpileModule(`const handler = ${callback.getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return { limit: async () => file ? [file] : [] };
            },
          };
        },
      };
    },
  };
  return new Function("db", "userStorageFiles", "eq", "and", "logger",
    `${js}\nreturn handler;`)(db, { id: "id", userId: "userId" },
      () => true, () => true, { warn() {} });
}

async function invoke(handler, req) {
  const result = { statusCode: 200, headers: {}, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    setHeader(key, value) { result.headers[key.toLowerCase()] = value; return this; },
    json(body) { result.body = body; return this; },
  };
  await handler(req, res);
  return result;
}

const file = { id: "owned-file", fileName: "track.wav", mimeType: "audio/wav", sizeBytes: 1024 };
const owner = { id: "owner" };

describe("file transcoding cannot claim work without a real worker", () => {
  it("retains validated file and job identifiers", () => {
    assert.match(startRoute.arguments[1].getText(parsed), /requireUUIDParam\("id"\)/);
    assert.match(statusRoute.arguments[1].getText(parsed), /requireSafeParam\("jobId"\)/);
  });

  it("requires authentication before starting work", async () => {
    const response = await invoke(compileHandler(startRoute, file), { params: { id: file.id }, body: {} });
    assert.equal(response.statusCode, 401);
  });

  it("returns 404 for a file not owned or not found", async () => {
    const response = await invoke(compileHandler(startRoute, null), { user: owner, params: { id: file.id }, body: {} });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
  });

  it("returns 503 for an owned file without claiming a queued transcode", async () => {
    const response = await invoke(compileHandler(startRoute, file), { user: owner, params: { id: file.id }, body: {} });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.outcome, "transcode_unavailable");
    assert.match(response.body.error, /unavailable|no job/i);
    assert.equal(Object.hasOwn(response.body, "jobId"), false);
    assert.match(response.headers["cache-control"], /no-store/);
  });

  it("requires authentication to query job status", async () => {
    const response = await invoke(compileHandler(statusRoute, null), { params: { jobId: "unknown" } });
    assert.equal(response.statusCode, 401);
  });

  it("never calls an unknown job completed or reports invented progress", async () => {
    const response = await invoke(compileHandler(statusRoute, null), { user: owner, params: { jobId: "unknown" } });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.outcome, "not_found");
    assert.equal(Object.hasOwn(response.body, "progress"), false);
    assert.equal(Object.hasOwn(response.body, "status"), false);
    assert.match(response.headers["cache-control"], /no-store/);
  });

  it("does not turn a formerly simulated job into a success", async () => {
    const response = await invoke(compileHandler(statusRoute, null), { user: owner, params: { jobId: "fake-job" } });
    assert.equal(response.statusCode, 404);
    assert.notEqual(response.body.outcome, "transcode_complete");
  });

  it("does not retain timer-driven fake transcode jobs", () => {
    assert.doesNotMatch(source, /const transcodeJobs\s*=|TRANSCODE_MIN_TTL_MS/);
  });
});
