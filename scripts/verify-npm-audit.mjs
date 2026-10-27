// Parse the local npm audit JSON without interpreting registry/network failure as clean.
// No arbitrary advice or sensitive report text is printed on errors.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function assessAuditReport(source) {
  let report;
  try {
    report = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw new Error("npm audit report is not valid JSON");
  }
  if (!report || typeof report !== "object" || Array.isArray(report) || report.error) {
    throw new Error("npm audit failed or produced an invalid report");
  }
  const counts = report.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("npm audit report does not contain a vulnerability summary");
  }
  // npm versions differ in optional severity buckets; high and critical are mandatory.
  for (const severity of ["high", "critical"]) {
    if (!Number.isSafeInteger(counts[severity]) || counts[severity] < 0) {
      throw new Error(`npm audit report has an invalid ${severity} count`);
    }
  }
  for (const [severity, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`npm audit report has an invalid count for ${severity}`);
    }
  }
  const highPlus = counts.high + counts.critical;
  if (!Number.isSafeInteger(highPlus)) {
    throw new Error("npm audit severity counts overflow");
  }
  return { counts, highPlus, passed: highPlus === 0 };
}

export function parseAuditExitStatus(source) {
  const value = typeof source === "string" ? source.trim() : "";
  if (!/^(0|[1-9][0-9]{0,2})$/.test(value) || Number(value) > 255) {
    throw new Error("npm audit CLI exit status is missing or invalid");
  }
  return Number(value);
}

export function verifyAuditReport(source, exitStatus = 0) {
  const result = assessAuditReport(source);
  if (exitStatus !== 0) {
    throw new Error("npm audit CLI returned a nonzero exit status");
  }
  console.log("== npm audit summary ==");
  for (const [severity, count] of Object.entries(result.counts)) {
    if (count > 0) console.log(`  ${severity}: ${count}`);
  }
  if (!result.passed) {
    throw new Error(`${result.highPlus} high/critical vulnerabilities found`);
  }
  console.log("No high/critical npm vulnerabilities reported");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    verifyAuditReport(
      readFileSync(resolve(process.argv[2] ?? "audit-report.json"), "utf8"),
      parseAuditExitStatus(readFileSync(resolve(process.argv[3] ?? "audit-exit-code.txt"), "utf8")),
    );
  } catch {
    // Deliberately do not print raw npm audit error contents or credentials.
    console.error("npm audit release gate failed (malformed/unavailable audit or high/critical findings)");
    process.exitCode = 1;
  }
}
