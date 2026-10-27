import test from "node:test";
import assert from "node:assert/strict";
import { generateHybridFileKey, isValidHybridFolder } from "../server/services/hybridFileKey.ts";

test("valid nested folder retains the authenticated namespace", () => {
  const key = generateHybridFileKey("user-123", "song.wav", "albums/2026");
  assert.match(key, /^user-123\/albums\/2026\/[a-f0-9]{32}-song\.wav$/);
});

test("no folder and empty folder produce safe root keys", () => {
  assert.match(generateHybridFileKey("user-123", "song.wav"), /^user-123\/[a-f0-9]{32}-song\.wav$/);
  assert.match(generateHybridFileKey("user-123", "song.wav", ""), /^user-123\/[a-f0-9]{32}-song\.wav$/);
});

test("repeated same-name uploads do not collide even at the same wall-clock time", () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 1234567890;
    const keys = new Set(Array.from({ length: 100 }, () => generateHybridFileKey("user-123", "song.wav", "albums")));
    assert.equal(keys.size, 100);
  } finally {
    Date.now = originalNow;
  }
});

test("reject traversal, absolute, encoded, empty and backslash folder segments", () => {
  for (const folder of ["../private", "x/../y", "/root", "root/", "x//y", "x\\y", "x%2Fy", "x?y", "x\0y", ".", "a/."]) {
    assert.equal(isValidHybridFolder(folder), false, folder);
    assert.throws(() => generateHybridFileKey("user-123", "song.wav", folder), /Invalid storage folder/);
  }
});

test("reject untrusted non-string and oversized folders", () => {
  for (const folder of [null, {}, ["a"], 1, "a".repeat(129), "a/b/c/d/e/f/g/h/i"]) {
    assert.equal(isValidHybridFolder(folder), false);
    assert.throws(() => generateHybridFileKey("user-123", "song.wav", folder), /Invalid storage folder/);
  }
});

test("preserve legitimate space and dotted folder segments", () => {
  assert.equal(isValidHybridFolder("my mixes/v1.2"), true);
  assert.match(generateHybridFileKey("user-123", "song.wav", "my mixes/v1.2"), /^user-123\/my mixes\/v1\.2\//);
});

test("reject invalid owner identifiers", () => {
  for (const owner of ["../victim", "", "x/y", "x%2Fy", "x\\y", null]) {
    assert.throws(() => generateHybridFileKey(owner, "song.wav"), /Invalid storage owner/);
  }
});

test("sanitize filename before constructing the key", () => {
  const key = generateHybridFileKey("user-123", "../secret\\file?.wav", "albums");
  assert.ok(!key.includes(".."));
  assert.ok(!key.includes("\\"));
  assert.ok(!key.includes("?"));
  assert.match(key, /^user-123\/albums\/[a-f0-9]{32}-/);
});

test("reject missing or empty filenames", () => {
  for (const name of ["", "  ", null, undefined, 7, "."]) {
    assert.throws(() => generateHybridFileKey("user-123", name), /Invalid storage filename/);
  }
});

test("limit filename length and keep stable path segments", () => {
  const key = generateHybridFileKey("user-123", "x".repeat(1000) + ".wav", "albums");
  assert.ok(key.split("/").at(-1).length <= 233);
  assert.equal(key.split("/").length, 3);
});
