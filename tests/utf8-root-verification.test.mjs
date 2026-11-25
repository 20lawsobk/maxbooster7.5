import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = path.resolve("script/lib/verify-utf8-root.py");

test("publishing root verification leaves ordinary files untouched", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "utf8-root-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "source.txt");
  fs.writeFileSync(file, "preserve");

  const result = spawnSync("python3", [helper, root], { encoding: "utf8", timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no files were removed/);
  assert.equal(fs.readFileSync(file, "utf8"), "preserve");
});

test("UTF-8 filename classifier identifies invalid bytes without filesystem mutation", () => {
  const result = spawnSync("python3", [
    "-B", "-c",
    `import importlib.util; s=importlib.util.spec_from_file_location("verify", ${JSON.stringify(helper)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.invalid_utf8_names([b"valid", b"broken-\\xff"]) == ["62726f6b656e2dff"]`,
  ], { encoding: "utf8", timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr);
});
