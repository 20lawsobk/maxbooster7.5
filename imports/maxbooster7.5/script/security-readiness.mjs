import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function dependencyLedger(scan, lock) {
  if (!Array.isArray(scan.vulnerabilities)) throw new Error("Dependency scanner occurrences missing");
  return scan.vulnerabilities.map((finding, index) => {
    if (!finding.id || !finding.package?.name || !finding.package?.version || !finding.severity?.level) {
      throw new Error(`Malformed dependency occurrence ${index + 1}`);
    }
    const rootLockCandidates = Object.entries(lock.packages ?? {})
      .filter(([path, record]) => path.endsWith(`node_modules/${finding.package.name}`) &&
        record.version === finding.package.version)
      .map(([path, record]) => ({ path, dev: record.dev === true, version: record.version }));
    return {
      occurrence: index + 1,
      id: finding.id,
      package: finding.package,
      severity: finding.severity.level,
      proposedFix: finding.fix?.version ?? null,
      rootLockCandidates,
      // A lock match is NOT an artifact provenance assignment.
      artifactAttribution: "unresolved",
    };
  });
}

export function sastGate(scan, revision) {
  const failures = [];
  if (scan.incomplete !== false) failures.push("SAST completion not demonstrated");
  if (!Array.isArray(scan.results)) failures.push("SAST results missing");
  else if (scan.results.length) failures.push("SAST findings require review");
  const coverage = scan.coverage;
  if (!revision || coverage?.revision !== revision) failures.push("SAST revision not bound to release candidate");
  if (!coverage?.ruleset || !Array.isArray(coverage.languages) || !coverage.languages.length ||
      !Number.isSafeInteger(coverage.files) || coverage.files < 1) {
    failures.push("SAST ruleset/language/file coverage missing");
  }
  return failures;
}

export function inspectReadiness(root, revision) {
  const evidence = {};
  function read(path) {
    const bytes = readFileSync(resolve(root, path));
    evidence[path] = createHash("sha256").update(bytes).digest("hex");
    return JSON.parse(bytes);
  }
  const occurrences = dependencyLedger(read("reports/readiness-audit/scanner-dependencies.json"), read("package-lock.json"));
  const failures = sastGate(read("reports/readiness-audit/scanner-sast.json"), revision);
  const manifest = read("package.json");
  if (String(manifest.overrides?.tar).startsWith("file:")) failures.push("Local tar override still active; real archive replacement pending");
  if (occurrences.length) failures.push(`${occurrences.length} source dependency observations still require artifact attribution and remediation evidence`);
  return { ready: failures.length === 0, failures, evidence, occurrences };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectReadiness(process.cwd(), process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ready ? 0 : 1;
  } catch (error) {
    console.error(`Security readiness evidence failed: ${error.message}`);
    process.exitCode = 1;
  }
}