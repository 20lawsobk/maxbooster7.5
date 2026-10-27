import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assessAuditReport, parseAuditExitStatus, verifyAuditReport } from "../scripts/verify-npm-audit.mjs";

const report = (counts) => JSON.stringify({ metadata: { vulnerabilities: counts } });

describe("npm audit release gate", () => {
  it("accepts a real zero-high-and-critical summary", () => {
    const value = assessAuditReport(report({ info: 0, low: 2, moderate: 3, high: 0, critical: 0, total: 5 }));
    assert.equal(value.passed, true);
    assert.equal(value.highPlus, 0);
  });
  it("rejects high severity advisories", () => {
    const value = assessAuditReport(report({ high: 1, critical: 0 }));
    assert.equal(value.passed, false);
    assert.throws(() => verifyAuditReport(report({ high: 1, critical: 0 })));
  });
  it("rejects critical severity advisories", () => {
    assert.equal(assessAuditReport(report({ high: 0, critical: 2 })).passed, false);
  });
  it("rejects an npm registry error JSON response", () => {
    assert.throws(() => assessAuditReport(JSON.stringify({ error: { code: "ENOAUDIT", summary: "registry unavailable" } })));
  });
  it("rejects an error even when a fake clean metadata object exists", () => {
    assert.throws(() => assessAuditReport({ error: { code: "NETWORK" }, metadata: { vulnerabilities: { high: 0, critical: 0 } } }));
  });
  it("rejects empty, non-object, and invalid JSON", () => {
    for (const value of ["", "[]", "null", "{}", "{not json", "[1,2,3]"]) {
      assert.throws(() => assessAuditReport(value), value);
    }
  });
  it("rejects missing or invalid high and critical counts", () => {
    for (const bad of [{high:0}, {critical:0}, {high:-1, critical:0},
      {high:"0",critical:0}, {high:0,critical:NaN}, {high:0,critical:Infinity},
      {high:1.5,critical:0}, {high:0,critical:-2}]) {
      assert.throws(() => assessAuditReport({ metadata: { vulnerabilities: bad } }));
    }
  });
  it("CLI exits zero only for a real clean audit report", () => {
    const temp = mkdtempSync(join(tmpdir(), "npm-audit-verifier-"));
    const file = join(temp, "audit.json");
    const statusFile = join(temp, "audit-exit-code.txt");
    const executable = resolve("scripts/verify-npm-audit.mjs");
    try {
      writeFileSync(file, report({ high: 0, critical: 0 }), "utf8");
      writeFileSync(statusFile, "0\n", "utf8");
      const clean = spawnSync(process.execPath, [executable, file, statusFile], { encoding: "utf8" });
      assert.equal(clean.status, 0, clean.stderr);

      writeFileSync(file, JSON.stringify({ error: { code: "ENOAUDIT" } }), "utf8");
      writeFileSync(statusFile, "1\n", "utf8");
      const failure = spawnSync(process.execPath, [executable, file, statusFile], { encoding: "utf8" });
      assert.equal(failure.status, 1, failure.stdout);
      assert.doesNotMatch(failure.stdout + failure.stderr, /ENOAUDIT/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });


  it("rejects a clean-looking audit report if npm audit itself failed", () => {
    const clean = report({ high: 0, critical: 0 });
    assert.equal(assessAuditReport(clean).passed, true);
    assert.throws(() => verifyAuditReport(clean, parseAuditExitStatus("1\n")), /nonzero/);
    assert.throws(() => verifyAuditReport(clean, parseAuditExitStatus("255")), /nonzero/);
  });

  it("rejects missing, malformed, or out-of-range audit CLI exit codes", () => {
    for (const value of ["", "-1", "256", "1.5", "true", "NaN", "0 garbage", "001", "1 0"]) {
      assert.throws(() => parseAuditExitStatus(value), value);
    }
    assert.equal(parseAuditExitStatus("0\n"), 0);
  });

  it("CLI refuses a clean report when audit status is nonzero or unavailable", () => {
    const temp = mkdtempSync(join(tmpdir(), "npm-audit-exit-status-"));
    const file = join(temp, "audit.json");
    const statusFile = join(temp, "audit-exit-code.txt");
    const executable = resolve("scripts/verify-npm-audit.mjs");
    try {
      writeFileSync(file, report({ high: 0, critical: 0 }), "utf8");
      writeFileSync(statusFile, "1\n", "utf8");
      const failed = spawnSync(process.execPath, [executable, file, statusFile], { encoding: "utf8" });
      assert.equal(failed.status, 1);
      writeFileSync(statusFile, "0\n", "utf8");
      const clean = spawnSync(process.execPath, [executable, file, statusFile], { encoding: "utf8" });
      assert.equal(clean.status, 0, clean.stderr);
      rmSync(statusFile);
      const missing = spawnSync(process.execPath, [executable, file, statusFile], { encoding: "utf8" });
      assert.equal(missing.status, 1);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed optional severity counts and overflow", () => {
    assert.throws(() => assessAuditReport(report({ high: 0, critical: 0, low: "fake" })));
    assert.throws(() => assessAuditReport(report({ high: Number.MAX_SAFE_INTEGER, critical: 1 })));
  });
});
