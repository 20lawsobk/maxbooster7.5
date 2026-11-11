import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeZoneCacheAtomically } from "../../dns-node/src/zone.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("DNS zone cache persistence", () => {
  it("creates the cache directory and atomically writes the verified zone", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dns-zone-cache-"));
    temporaryDirectories.push(directory);
    const target = path.join(directory, "nested", "zone.json");
    const contents = JSON.stringify({ domain: "example.test", serial: 1, records: [] });

    writeZoneCacheAtomically(target, contents);

    expect(fs.readFileSync(target, "utf8")).toBe(contents);
    expect(fs.readdirSync(path.dirname(target))).toEqual(["zone.json"]);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it("replaces an existing cache without leaving a partial temporary file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dns-zone-cache-"));
    temporaryDirectories.push(directory);
    const target = path.join(directory, "zone.json");
    fs.writeFileSync(target, "old");

    writeZoneCacheAtomically(target, "new");

    expect(fs.readFileSync(target, "utf8")).toBe("new");
    expect(fs.readdirSync(directory)).toEqual(["zone.json"]);
  });
});
