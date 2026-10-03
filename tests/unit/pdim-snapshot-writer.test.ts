import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeSnapshotOffThread } from "../../server/lib/pdimSnapshotWriter";

const directories: string[] = [];
const destination = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-worker-"));
  directories.push(directory);
  return path.join(directory, "snapshot.json");
};
afterEach(() => directories.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
describe("off-thread checkpoint writer", () => {
  it("captures mutable entries synchronously and writes the original checkpoint", async () => {
    const file = destination();
    const entries = { list: { type: "list", value: ["before"] }, seq: { type: "string", value: "73" } };
    const writing = writeSnapshotOffThread(file, entries);
    entries.list.value.push("after");
    entries.seq.value = "74";
    await writing;
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
      list: { type: "list", value: ["before"] }, seq: { type: "string", value: "73" },
    });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
  it("does not overwrite an existing checkpoint", async () => {
    const file = destination();
    fs.writeFileSync(file, "original");
    await expect(writeSnapshotOffThread(file, { x: 1 })).rejects.toThrow(/EEXIST/);
    expect(fs.readFileSync(file, "utf8")).toBe("original");
  });
  it("rejects serialization failures after stopping the worker", async () => {
    const file = destination();
    await expect(writeSnapshotOffThread(file, { invalid: 1n })).rejects.toThrow(/BigInt/);
    fs.rmSync(file);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(fs.existsSync(file)).toBe(false);
  });
});