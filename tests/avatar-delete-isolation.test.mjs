import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = readFileSync(resolve("server/routes.ts"), "utf8");
const opening = '  app.delete("/api/auth/avatar", async (req: Request, res: Response) => {';
const ending = '\n  // Storage: Serve files from hybrid storage';
const start = source.indexOf(opening);
assert.notEqual(start, -1, "Authenticated avatar deletion route must exist");
const end = source.indexOf(ending, start);
assert.notEqual(end, -1, "Avatar deletion route boundary must exist");
const route = source.slice(start, end);
assert.match(route, /storage\.updateUser\(req\.user\.id/);
const body = route.slice(opening.length).replace(/\n  \}\);\s*$/, "\n");
assert.notEqual(body, route.slice(opening.length), "Route closing delimiter must be matched");

function createHandler(updates) {
  const storage = { async updateUser(id, value) { updates.push({ id, value }); } };
  const logger = { warn() {}, info() {} };
  return new Function("storage", "logger", `return async (req, res) => {${body}}`)(storage, logger);
}
function response() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test("an unauthenticated caller cannot clear an avatar", async () => {
  const updates = [];
  const res = response();
  await createHandler(updates)({ user: null }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(updates, []);
});

test("a forged avatar URL cannot delete a different file through dot-dot traversal", async () => {
  const root = mkdtempSync(join(tmpdir(), "maxbooster-avatar-isolation-"));
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, "uploads", "avatars"), { recursive: true });
    const target = join(root, "sensitive.txt");
    writeFileSync(target, "must survive");
    process.chdir(root);
    const updates = [];
    const res = response();
    await createHandler(updates)({ user: { id: "attacker", avatarUrl: "/uploads/avatars/../../sensitive.txt" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(existsSync(target), true, "User-controlled avatar URL deleted an unrelated file");
    assert.equal(readFileSync(target, "utf8"), "must survive");
    assert.deepEqual(updates, [{ id: "attacker", value: { avatarUrl: null, profileImageUrl: null } }]);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test("avatar deletion clears the profile without unlinking an unowned local path", async () => {
  const root = mkdtempSync(join(tmpdir(), "maxbooster-avatar-owned-"));
  const originalCwd = process.cwd();
  try {
    mkdirSync(join(root, "uploads", "avatars"), { recursive: true });
    const target = join(root, "uploads", "avatars", "shared.webp");
    writeFileSync(target, "keep unverified file");
    process.chdir(root);
    const updates = [];
    const res = response();
    await createHandler(updates)({ user: { id: "user-1", avatarUrl: "/uploads/avatars/shared.webp" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(existsSync(target), true, "Unverified file ownership must not trigger unlink");
    assert.deepEqual(updates, [{ id: "user-1", value: { avatarUrl: null, profileImageUrl: null } }]);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
