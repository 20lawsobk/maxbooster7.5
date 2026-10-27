// Parse the local npm audit JSON without interpreting registry/network failure as clean.
// No arbitrary advice or sensitive report text is printed on errors.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function assessAuditReport(source, auditExitStatus = 0) {
  if (!Number.isSafeInteger(auditExitStatus) || auditExitStatus < 0 || auditExitStatus > 255) {
    throw new Error("npm audit exit status is missing or invalid");
  }
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
  return { counts, highPlus, auditExitStatus, passed: highPlus === 0 && auditExitStatus === 0 };
}

export function verifyAuditReport(source, auditExitStatus = 0) {
  const result = assessAuditReport(source, auditExitStatus);
  console.log("== npm audit summary ==");
  for (const [severity, count] of Object.entries(result.counts)) {
    if (count > 0) console.log(`  ${severity}: ${count}`);
  }
  if (result.highPlus > 0) {
    throw new Error(`${result.highPlus} high/critical vulnerabilities found`);
  }
  if (result.auditExitStatus !== 0) {
    throw new Error("npm audit exited unsuccessfully without verified high/critical advisories");
  }
  console.log("No high/critical npm vulnerabilities reported");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // The npm process exit status is mandatory. A clean-looking JSON summary
    // cannot override a failed registry/CLI invocation with no explicit error.
    if (!process.argv[3]) throw new Error("npm audit exit status file is required");
    const rawStatus = readFileSync(resolve(process.argv[3]), "utf8");
    if (!/^(?:0|[1-9][0-9]{0,2})\r?\n?$/.test(rawStatus)) {
      throw new Error("npm audit exit status file is malformed");
    }
    verifyAuditReport(
      readFileSync(resolve(process.argv[2] ?? "audit-report.json"), "utf8"),
      Number(rawStatus.trim()),
    );
  } catch {
    // Deliberately do not print raw npm audit error contents or credentials.
    console.error("npm audit release gate failed (malformed/unavailable audit or high/critical findings)");
    process.exitCode = 1;
  }
}
