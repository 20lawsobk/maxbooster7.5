import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assessAuditReport, verifyAuditReport } from "../scripts/verify-npm-audit.mjs";

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
    const statusFile = join(temp, "audit-exit-status.txt");
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

  it("rejects malformed optional severity counts and overflow", () => {
    assert.throws(() => assessAuditReport(report({ high: 0, critical: 0, low: "fake" })));
    assert.throws(() => assessAuditReport(report({ high: Number.MAX_SAFE_INTEGER, critical: 1 })));
  });
});


describe("audit CLI exit status fail-closed behavior", () => {
  it("rejects a clean-looking JSON report if npm exited nonzero", () => {
    const clean = report({ high: 0, critical: 0 });
    assert.equal(assessAuditReport(clean, 0).passed, true);
    assert.equal(assessAuditReport(clean, 1).passed, false);
    assert.equal(assessAuditReport(clean, 42).passed, false);
    assert.throws(() => verifyAuditReport(clean, 1));
    for (const bad of [-1, 256, 1.5, NaN, Infinity, "0", null]) {
      assert.throws(() => assessAuditReport(clean, bad));
    }
  });

  it("CLI requires a valid status file and refuses clean JSON after failed npm", () => {
    const temp = mkdtempSync(join(tmpdir(), "npm-audit-status-"));
    const file = join(temp, "audit.json");
    const statusFile = join(temp, "audit-exit-status.txt");
    const executable = resolve("scripts/verify-npm-audit.mjs");
    const invoke = (...args) => spawnSync(process.execPath, [executable, ...args], { encoding: "utf8" });
    try {
      writeFileSync(file, report({ high: 0, critical: 0 }), "utf8");
      assert.equal(invoke(file).status, 1, "missing status must fail");
      writeFileSync(statusFile, "not-a-status\n", "utf8");
      assert.equal(invoke(file, statusFile).status, 1, "malformed status must fail");
      writeFileSync(statusFile, "1\n", "utf8");
      assert.equal(invoke(file, statusFile).status, 1, "failed npm must fail");
      writeFileSync(statusFile, "0\n", "utf8");
      assert.equal(invoke(file, statusFile).status, 0, "valid clean audit must pass");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
