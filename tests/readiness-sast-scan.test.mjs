import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildInventory,
  isolatedScannerEnv,
  sanitizeSemgrep,
} from "../scripts/readiness-sast-scan.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sast-runner-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, file, contents) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), contents);
}

test("scanner environment isolation is child-only and disables telemetry checks", () => {
  const original = { PATH: "/bin", PYTHONPATH: "/workspace/.pythonlibs", PYTHONHOME: "/nix/python" };
  const isolated = isolatedScannerEnv(original);
  assert.equal(isolated.PYTHONPATH, undefined);
  assert.equal(isolated.PYTHONHOME, undefined);
  assert.equal(isolated.PYTHONNOUSERSITE, "1");
  assert.equal(isolated.SEMGREP_SEND_METRICS, "off");
  assert.equal(isolated.SEMGREP_ENABLE_VERSION_CHECK, "0");
  assert.equal(original.PYTHONPATH, "/workspace/.pythonlibs");
});

test("inventory hashes tracked first-party source and documents generated exclusions", async (t) => {
  const root = fixture(t);
  write(root, "server/app.ts", "export const app = true;\n");
  write(root, "external/maxcore/server.py", "print('nested source')\n");
  write(root, "external/maxcore/dist/bundle.js", "generated\n");
  write(root, "reports/cache/finding.ts", "evidence cache\n");
  write(root, "artifacts/api/dist.js", "generated\n");
  const files = [
    "server/app.ts",
    "external/maxcore/server.py",
    "external/maxcore/dist/bundle.js",
    "reports/cache/finding.ts",
    "artifacts/api/dist.js",
  ];
  const first = await buildInventory(root, files);
  const second = await buildInventory(root, files);
  assert.deepEqual(first.files.map((entry) => entry.path), [
    "external/maxcore/server.py",
    "server/app.ts",
  ]);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.excluded["generated-segment:dist"], 1);
  assert.equal(first.excluded["generated-segment:reports"], 1);
  assert.equal(first.excluded["generated-root:artifacts"], 1);
});

test("sanitized output retains actionable location but no source snippets or metavariables", () => {
  const stage = "/private/stage";
  const raw = {
    results: [{
      check_id: "example.command-injection",
      path: `${stage}/server/run.ts`,
      start: { line: 12, col: 3 },
      end: { line: 12, col: 20 },
      extra: {
        severity: "ERROR",
        message: "Untrusted input reaches command execution",
        lines: "exec(secretValue)",
        metavars: { "$X": { abstract_content: "secretValue" } },
        metadata: { cwe: ["CWE-78"], confidence: "HIGH" },
      },
    }],
    errors: [],
    paths: { scanned: [`${stage}/server/run.ts`], skipped: [] },
  };
  const sanitized = sanitizeSemgrep(raw, stage);
  assert.equal(sanitized.findings[0].path, "server/run.ts");
  assert.equal(sanitized.findings[0].start.line, 12);
  assert.equal(sanitized.findings[0].lines, undefined);
  assert.equal(sanitized.findings[0].metavars, undefined);
  assert.doesNotMatch(JSON.stringify(sanitized), /secretValue/);
});

test("sanitized output deduplicates exact scanner duplicates without merging locations", () => {
  const stage = "/private/stage";
  const finding = {
    check_id: "example.command-injection",
    path: `${stage}/server/run.ts`,
    start: { line: 12, col: 3 },
    end: { line: 12, col: 20 },
    extra: { severity: "ERROR", message: "Review process execution", metadata: {} },
  };
  const atSecondLocation = {
    ...finding,
    start: { line: 20, col: 3 },
    end: { line: 20, col: 20 },
  };
  const sanitized = sanitizeSemgrep({
    results: [finding, { ...finding }, atSecondLocation],
    errors: [],
    paths: { scanned: [`${stage}/server/run.ts`], skipped: [] },
  }, stage);
  assert.equal(sanitized.findings.length, 2);
  assert.deepEqual(sanitized.findings.map((item) => item.start.line), [12, 20]);
});

test("scanner errors and explicit skips remain visible and temporary roots are masked", () => {
  const stage = "/private/stage";
  const sanitized = sanitizeSemgrep({
    results: [],
    errors: [{ type: "Parse error", path: `${stage}/bad.py`, message: `failed under ${stage}` }],
    paths: { scanned: [], skipped: [{ path: `${stage}/large.ts`, reason: "too large" }] },
  }, stage);
  assert.deepEqual(sanitized.errors, [{
    type: "Parse error",
    path: "bad.py",
    message: "failed under <temporary-scan-root>",
  }]);
  assert.deepEqual(sanitized.skipped, [{ path: "large.ts", reason: "too large" }]);
});

test("structured scanner error types retain their stable category only", () => {
  const sanitized = sanitizeSemgrep({
    results: [],
    errors: [{
      type: ["PartialParsing", { path: "/private/stage/bad.tsx" }],
      path: "/private/stage/bad.tsx",
      message: "recoverable parser failure",
    }],
    paths: { scanned: [], skipped: [] },
  }, "/private/stage");
  assert.equal(sanitized.errors[0].type, "PartialParsing");
});
