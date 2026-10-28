import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const service = readFileSync(new URL("../server/services/hybridStorageService.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../server/routes/hybridStorage.ts", import.meta.url), "utf8");

// Run the actual checked-in function body, without importing the PDIM server
// or needing a live database. This is an isolated source-derived contract,
// not an HTTP integration test.
const match = service.match(
  /export function normalizeHybridUploadFolder\(value: unknown\): string \| undefined \{([\s\S]*?)\n\}\n\nexport class HybridStorageService/,
);
assert.ok(match, "hybrid upload folder validator must be present");
const normalizeFolder = new Function("value", match[1]);

test("omitted and empty folders preserve the default storage namespace", () => {
  for (const value of [undefined, null, ""]) {
    assert.equal(normalizeFolder(value), undefined);
  }
});

test("ordinary and nested relative folder names are preserved", () => {
  for (const folder of ["exports", "music/exports", "my files/2026", "covers.v2", "a_b-c"]) {
    assert.equal(normalizeFolder(folder), folder);
  }
});

test("path traversal, absolute and non-canonical paths are rejected", () => {
  for (const folder of [
    "../private", "safe/../private", ".", "safe/./private", "/root",
    "safe//private", "safe/", "safe\\private", "safe..hidden",
    "%2e%2e/private", "safe%2fprivate", "safe\0private",
  ]) {
    assert.throws(() => normalizeFolder(folder), /Invalid hybrid storage folder/, JSON.stringify(folder));
  }
});

test("non-string, control-character and oversized folders are rejected", () => {
  for (const folder of [[], {}, 123, false, "a\nb", "a\rb", "a".repeat(257)]) {
    assert.throws(() => normalizeFolder(folder), /Invalid hybrid storage folder/);
  }
});

test("upload validates the folder before initializing or writing PDIM", () => {
  const upload = service.slice(service.indexOf("  async upload("), service.indexOf("  private async writeToReplit("));
  const validation = upload.indexOf("normalizeHybridUploadFolder(options?.folder)");
  const initialize = upload.indexOf("await this.initialize()");
  const write = upload.indexOf("this.coldPocket!.write(");
  assert.ok(validation >= 0 && initialize > validation && write > initialize);
  assert.match(upload, /generateFileKey\(userId, fileName, safeFolder\)/);
});

test("authenticated hybrid upload rejects invalid folders with HTTP 400", () => {
  const handler = route.slice(route.indexOf('router.post('), route.indexOf('/**\n * GET /api/hybrid-storage/file/'));
  assert.match(handler, /safeFolder = normalizeHybridUploadFolder\(folder\)/);
  assert.match(handler, /return res.status\(400\).json\(\{ error: "Invalid hybrid storage folder" \}\)/);
  assert.match(handler, /folder: safeFolder/);
  assert.ok(handler.indexOf("safeFolder = normalizeHybridUploadFolder(folder)") < handler.indexOf("hybridStorageService?.upload("));
});
