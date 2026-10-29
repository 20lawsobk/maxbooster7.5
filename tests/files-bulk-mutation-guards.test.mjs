import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(fileURLToPath(new URL("../server/routes/files.ts", import.meta.url)), "utf8");
const parsed = ts.createSourceFile("files.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const fileId = "11111111-1111-4111-8111-111111111111";

function routeHandler(path, dependencies) {
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(parsed) === "router" &&
        node.expression.name.text === "post" &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === path) {
      callback = node.arguments.at(-1);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(callback && ts.isArrowFunction(callback), `Missing route callback: ${path}`);
  const compiled = ts.transpileModule(`const callback = ${callback.getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn callback;`)(
    ...Object.values(dependencies),
  );
}

function fixture({ selectError = null } = {}) {
  const calls = { select: 0, update: 0, delete: 0, storageDelete: 0 };
  const row = { id: fileId, userId: "owner", fileKey: "owner/file", sizeBytes: 7 };
  const db = {
    select() {
      calls.select++;
      return { from() { return { where() { return { async limit() {
        if (selectError) throw selectError;
        return [row];
      } }; } }; } };
    },
    update() {
      calls.update++;
      return { set() { return { async where() { return []; } }; } };
    },
    delete() {
      calls.delete++;
      return { async where() { return []; } };
    },
  };
  const storageService = { async deleteFile() { calls.storageDelete++; } };
  const dependencies = {
    db, storageService,
    userStorageFiles: { id: "id", userId: "userId", deletedAt: "deletedAt" },
    userStorage: { userId: "userId", totalBytes: "totalBytes", fileCount: "fileCount" },
    eq: (...args) => args, and: (...args) => args,
    isNull: (x) => x, isNotNull: (x) => x,
    sql: (parts) => parts.join("?"),
    logger: { warn() {} },
    PERMANENT_DELETE_DAYS: 30,
    getOrCreateUserStorage: async () => { throw new Error("DATABASE_URL=private-credential"); },
    ALL_ALLOWED_TYPES: ["audio/wav"],
    MAX_UPLOAD_FILE_SIZE: 500 * 1024 * 1024,
    formatBytes: (n) => String(n),
  };
  const response = {
    statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  return { calls, dependencies, response };
}

async function invoke(path, body, options = {}) {
  const { calls, dependencies, response } = fixture(options);
  const callback = routeHandler(path, dependencies);
  const req = {
    user: { id: "owner" },
    body,
    file: { mimetype: "audio/wav", size: 7, originalname: "test.wav", buffer: Buffer.from("1234567") },
  };
  await callback(req, response);
  return { calls, response };
}

describe("file mutation safety at committed route callbacks", () => {
  it("rejects string false rather than permanently deleting bytes", async () => {
    const { calls, response } = await invoke("/bulk-delete", { fileIds: [fileId], permanent: "false" });
    assert.equal(response.statusCode, 400);
    assert.equal(calls.storageDelete, 0);
    assert.equal(calls.select, 0);
  });
  it("rejects other nonboolean destructive flags", async () => {
    for (const value of ["true", 1, null, [], {}]) {
      const { calls, response } = await invoke("/bulk-delete", { fileIds: [fileId], permanent: value });
      assert.equal(response.statusCode, 400);
      assert.equal(calls.storageDelete, 0);
    }
  });
  it("retains soft-delete behavior for boolean false and absent flag", async () => {
    for (const body of [{ fileIds: [fileId], permanent: false }, { fileIds: [fileId] }]) {
      const { calls, response } = await invoke("/bulk-delete", body);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.totalDeleted, 1);
      assert.equal(calls.storageDelete, 0);
      assert.equal(calls.update, 1);
    }
  });
  it("allows permanent deletion only for explicit boolean true", async () => {
    const { calls, response } = await invoke("/bulk-delete", { fileIds: [fileId], permanent: true });
    assert.equal(response.statusCode, 200);
    assert.equal(calls.storageDelete, 1);
    assert.equal(calls.delete, 1);
  });
  it("rejects duplicate and malformed IDs before database access", async () => {
    for (const ids of [[fileId, fileId], ["../escape"], [123], [null]]) {
      const { calls, response } = await invoke("/bulk-delete", { fileIds: ids, permanent: true });
      assert.equal(response.statusCode, 400);
      assert.equal(calls.select, 0);
      assert.equal(calls.storageDelete, 0);
    }
    const { calls, response } = await invoke("/bulk-restore", { fileIds: [fileId, fileId] });
    assert.equal(response.statusCode, 400);
    assert.equal(calls.select, 0);
  });
  it("redacts database/provider exception text from bulk operation results", async () => {
    for (const path of ["/bulk-delete", "/bulk-restore"]) {
      const { response } = await invoke(path, { fileIds: [fileId] }, {
        selectError: new Error("DATABASE_URL=private-credential"),
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.totalFailed, 1);
      assert.doesNotMatch(JSON.stringify(response.body), /DATABASE_URL|private-credential/);
    }
  });
  it("redacts internal upload exceptions from client responses", async () => {
    const { response } = await invoke("/upload", {});
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.outcome, "upload_failed");
    assert.doesNotMatch(JSON.stringify(response.body), /DATABASE_URL|private-credential/);
  });
});
