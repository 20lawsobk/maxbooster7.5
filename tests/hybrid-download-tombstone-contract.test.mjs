import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const secondary = readFileSync("server/routes/storage.ts", "utf8");
const legacy = readFileSync("server/routes/hybridStorage.ts", "utf8");

function routeBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, "Expected download route boundaries");
  return source.slice(start, end);
}

const secondaryRead = routeBody(
  secondary,
  'router.get(\n  "/hybrid/file/*key",',
  'router.delete(\n  "/hybrid/file/*key",',
);
const legacyRead = routeBody(
  legacy,
  'router.get(\n  "/file/:fileKey",',
  '* DELETE /api/hybrid-storage/file',
);

function requireDenyBeforeRead(body, keyName) {
  assert.ok(
    body.includes('eq(userStorageFiles.fileKey, ' + keyName +
      '), isNotNull(userStorageFiles.deletedAt)'),
    "Must query durable soft-delete tombstones by the exact requested key",
  );
  const denied = body.indexOf("if (deletedTracking)");
  const byteRead = body.indexOf("hybridStorageService?.read(");
  assert.ok(denied >= 0 && byteRead > denied, "Tombstone denial must precede byte fetch");
  assert.ok(body.slice(denied, byteRead).includes("status(404)"), "Deleted object must be 404");
  assert.match(body, /Cache-Control", "private, no-store"/, "Private bytes must not be cached");
}

test("secondary hybrid download denies tracked tombstones before fetching bytes", () => {
  requireDenyBeforeRead(secondaryRead, "key");
});

test("legacy hybrid download denies tracked tombstones before fetching bytes", () => {
  requireDenyBeforeRead(legacyRead, "fileKey");
  assert.doesNotMatch(legacyRead, /decodeURIComponent/, "Express params must not be decoded twice");
  assert.ok(legacyRead.includes('fileKey.includes("..")'), "Legacy route must reject traversal");
});

test("contract rejects a route that fetches bytes before checking tombstones", () => {
  const unsafe = secondaryRead.replace("if (deletedTracking)", "if (false)");
  assert.throws(() => requireDenyBeforeRead(unsafe, "key"));
});
