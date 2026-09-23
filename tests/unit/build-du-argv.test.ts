import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { duBytesOrNull } from "../../script/build.js";

const originalCwd = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("build disk-usage measurement", () => {
  it("passes shell metacharacters to du as a literal argv value", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "maxbooster-du-argv-"),
    );
    temporaryDirectories.push(temporaryDirectory);
    process.chdir(temporaryDirectory);

    const target = path.join(temporaryDirectory, "$(touch${IFS}pwned)");
    fs.mkdirSync(target);

    expect(duBytesOrNull(target)).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(path.join(temporaryDirectory, "pwned"))).toBe(false);
  });
});