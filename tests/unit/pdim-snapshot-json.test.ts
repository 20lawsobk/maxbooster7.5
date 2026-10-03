import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSnapshotJson, snapshotJsonChunks } from "../../server/lib/pdimSnapshotJson";

function read(text: string, bytes = 3) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-json-"));
  try {
    const file = path.join(dir, "data.json");
    fs.writeFileSync(file, text);
    return readSnapshotJson(file, bytes);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
describe("bounded snapshot JSON", () => {
  it("retains unicode, escapes, nested values, and boundary characters", () => {
    const obj = { special: { text: 'é雪😀 " \\\\ },{[]', data: [null, true, { v: 12 }] }, watermark: 321 };
    for (const size of [1, 2, 3, 7, 16, 1024]) {
      expect(read(snapshotJsonChunks(obj).join(""), size)).toEqual(obj);
    }
    expect(read("{}")).toEqual({});
    expect(read(" \n{ \"x\":1 } \n")).toEqual({ x: 1 });
  });
  it("rejects malformed, truncated, duplicate or trailing input", () => {
    for (const input of ["", "[]", '{"a":', '{"a":1,}', '{"a":1}x', '{"a":1,"a":2}', "{,}", '{"a":[1}', '{"a":"x}']) {
      expect(() => read(input)).toThrow();
    }
  });
  it("does not mutate the object prototype through persisted keys", () => {
    const data = read('{"__proto__":{"polluted":true},"constructor":3}');
    expect(Object.getPrototypeOf(data)).toBeNull();
    expect(Object.hasOwn(data, "__proto__")).toBe(true);
  });
});