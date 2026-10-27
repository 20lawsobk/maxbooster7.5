import { describe, expect, it } from "vitest";
import { generateHybridFileKey } from "../../server/services/hybridFileKey.js";

describe("hybrid upload key isolation", () => {
  it("generates unique keys for repeated uploads of the same filename", () => {
    const keys = Array.from({ length: 500 }, () => generateHybridFileKey("account-a", "track.wav"));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^account-a\/[0-9a-f-]{36}-track\.wav$/);
    }
  });

  it("keeps different users in distinct namespaces", () => {
    expect(generateHybridFileKey("account-a", "x.wav")).toMatch(/^account-a\//);
    expect(generateHybridFileKey("account-b", "x.wav")).toMatch(/^account-b\//);
  });

  it("supports safe nested folders and sanitizes filenames", () => {
    expect(generateHybridFileKey("u", "My Track.wav", "Projects/Live Set"))
      .toMatch(/^u\/Projects\/Live_Set\/[0-9a-f-]{36}-My_Track\.wav$/);
  });

  it("rejects folder traversal, empty segments and encoded escapes", () => {
    for (const folder of ["../other", "foo/../bar", "./foo", "foo//bar", "/root", "foo/", "foo\\bar", "%2e%2e", "a/%2F/b"]) {
      expect(() => generateHybridFileKey("u", "track.wav", folder)).toThrow("Invalid hybrid storage folder");
    }
  });

  it("rejects invalid user namespaces", () => {
    for (const id of ["", ".", "..", "a/b", "a\\b", "a\0b"]) {
      expect(() => generateHybridFileKey(id, "track.wav")).toThrow("Invalid hybrid storage user namespace");
    }
  });

  it("rejects empty and dot-only file names", () => {
    for (const name of ["", " ", ".", ".."]) {
      expect(() => generateHybridFileKey("u", name)).toThrow("Invalid hybrid storage file name");
    }
  });

  it("preserves safe nested folder naming conventions", () => {
    expect(generateHybridFileKey("u", "stem_01.flac", "projects/123/assets"))
      .toMatch(/^u\/projects\/123\/assets\/[0-9a-f-]{36}-stem_01\.flac$/);
  });
});
