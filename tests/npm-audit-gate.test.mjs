import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  it("rejects malformed optional severity counts and overflow", () => {
    assert.throws(() => assessAuditReport(report({ high: 0, critical: 0, low: "fake" })));
    assert.throws(() => assessAuditReport(report({ high: Number.MAX_SAFE_INTEGER, critical: 1 })));
  });
});
