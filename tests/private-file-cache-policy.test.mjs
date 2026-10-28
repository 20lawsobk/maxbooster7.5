import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const start = source.indexOf('app.get("/api/storage/file/*key"');
const end = source.indexOf("  // Auth: Export user data", start);
assert.ok(start >= 0 && end > start, "Authenticated storage download handler must be present");
const route = source.slice(start, end);

const cacheAssignments = [...route.matchAll(
  /res\.setHeader\(\s*["']Cache-Control["']\s*,\s*([^;\n]+)\s*\);/g,
)];

test("authenticated download keeps its authentication guard", () => {
  const guard = route.indexOf("if (!req.user)");
  const fetch = route.indexOf("storageService.downloadFile(key)");
  assert.ok(guard >= 0 && fetch > guard, "Authenticate before fetching private bytes");
});

test("every authenticated file response cache assignment is private no-store", () => {
  assert.ok(cacheAssignments.length > 0, "No Cache-Control header found");
  for (const assignment of cacheAssignments) {
    for (const stemAccess of [null, false, true]) {
      const value = runInNewContext(assignment[1], { stemAccess }, { timeout: 100 });
      assert.equal(value, "private, no-store",
        "Never cache authenticated bytes across logout, revocation or entitlement changes");
    }
  }
});

test("the final cache policy is set before the bytes are sent", () => {
  const send = route.indexOf("res.send(fileBuffer)");
  const last = cacheAssignments.at(-1);
  assert.ok(last && send > last.index, "Final cache policy must precede the byte response");
  assert.ok(last.index > route.indexOf('res.setHeader("Content-Length", fileBuffer.length)'),
    "A late header must not override private no-store with a cacheable value");
});
