import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_PATH = path.resolve(MODULE_DIR, "../../docs/testing/competitor-evidence.json");
const EVIDENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AREA_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reportSourceAuditStatus(report) {
  const audit = report?.checks?.find(check => check.id === "launch-readiness-audit");
  try {
    return JSON.parse(audit?.output ?? "{}").sourceFreshness ?? "UNVERIFIED";
  } catch {
    return "UNVERIFIED";
  }
}

function validateEvidence(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.areas) ||
      !Array.isArray(manifest.competitors) || !manifest.methodology) {
    throw new Error("Competitor evidence manifest has an unsupported schema");
  }
  const competitorIds = new Set();
  for (const competitor of manifest.competitors) {
    if (!competitor || typeof competitor.id !== "string" || competitorIds.has(competitor.id) ||
        !Array.isArray(competitor.sources) || competitor.sources.length === 0) {
      throw new Error("Competitor evidence manifest contains an invalid or duplicate competitor");
    }
    competitorIds.add(competitor.id);
    for (const source of competitor.sources) {
      if (source.status !== "HTTP_200" || source.evidenceType !== "official-page-metadata" ||
          typeof source.url !== "string" || !source.url.startsWith("https://") ||
          typeof source.claim !== "string" || !source.claim.trim() ||
          !Number.isFinite(Date.parse(source.retrievedAt ?? ""))) {
        throw new Error(`Competitor ${competitor.id} has incomplete or unverified source evidence`);
      }
    }
  }
  const areaIds = new Set();
  for (const area of manifest.areas) {
    if (!AREA_ID_RE.test(area?.id ?? "") || areaIds.has(area.id) ||
        !Array.isArray(area.competitorIds) || area.competitorIds.length === 0 ||
        !Array.isArray(area.acceptanceCriteria) || area.acceptanceCriteria.length === 0 ||
        area.competitorIds.some(id => !competitorIds.has(id))) {
      throw new Error("Competitor evidence manifest contains an invalid product-area mapping");
    }
    areaIds.add(area.id);
  }
}

async function readEvidenceManifest(filePath = EVIDENCE_PATH) {
  const raw = await fs.readFile(filePath);
  const manifest = JSON.parse(raw.toString("utf8"));
  validateEvidence(manifest);
  return { manifest, manifestSha256: sha256(raw) };
}

function isFreshEvidence(manifest, now) {
  const collectedAt = Date.parse(manifest.collectedAt);
  return Number.isFinite(collectedAt) && collectedAt <= now + 24 * 60 * 60 * 1000 &&
    now - collectedAt <= EVIDENCE_TTL_MS;
}

function taggedChecks(report, areaId) {
  return (Array.isArray(report?.checks) ? report.checks : [])
    .filter(check => Array.isArray(check.benchmarkAreaIds) &&
      check.benchmarkAreaIds.includes(areaId))
    .map(check => ({
      id: typeof check.id === "string" ? check.id.slice(0, 240) : "unknown-check",
      status: ["PASS", "FAIL", "BLOCKED", "UNVERIFIED", "SKIPPED"].includes(check.status)
        ? check.status
        : "UNVERIFIED",
      measurements: Array.isArray(check.benchmarkMeasurements)
        ? check.benchmarkMeasurements.filter(measurement =>
          measurement && typeof measurement.metricId === "string" &&
          Number.isFinite(measurement.value) &&
          typeof measurement.unit === "string" &&
          typeof measurement.scope === "string")
        : [],
    }));
}

function compareMeasurements(area, checks) {
  const sources = area.competitorIds.flatMap(id =>
    area._competitors.get(id)?.sources ?? []);
  const references = sources.flatMap(source => source.metrics ?? []);
  const actual = checks.filter(check => check.status === "PASS")
    .flatMap(check => check.measurements.map(measurement => ({ ...measurement, checkId: check.id })));
  const results = [];
  for (const reference of references) {
    const matched = actual.find(measurement =>
      measurement.metricId === reference.metricId &&
      measurement.unit === reference.unit &&
      measurement.scope === reference.scope);
    if (!matched) {
      results.push({
        metricId: reference.metricId,
        unit: reference.unit,
        referenceValue: reference.value,
        status: "UNVERIFIED",
        reason: "No passing current-run Max Booster measurement has the identical metric, unit, and scope.",
      });
      continue;
    }
    const meets = reference.comparison === "AT_LEAST"
      ? matched.value >= reference.value
      : matched.value <= reference.value;
    results.push({
      metricId: reference.metricId,
      unit: reference.unit,
      referenceValue: reference.value,
      measuredValue: matched.value,
      checkId: matched.checkId,
      status: meets ? "AT_OR_ABOVE_REFERENCE" : "BELOW_REFERENCE",
    });
  }
  return results;
}

export async function evaluateCompetitorBenchmarks({ report, now = Date.now(), evidencePath } = {}) {
  const { manifest, manifestSha256 } = await readEvidenceManifest(evidencePath);
  const currentEvidence = isFreshEvidence(manifest, now);
  if (report?.mode !== "full") {
    return {
      summary: {
        competitorComparisons: "NOT_RUN",
        evidenceStatus: currentEvidence ? "CURRENT_PUBLIC_CLAIMS" : "STALE_PUBLIC_CLAIMS",
        evidenceCapturedAt: manifest.collectedAt,
        evidenceManifestSha256: manifestSha256,
        coveredProductAreas: manifest.areas.length,
        sourceCount: manifest.competitors.reduce((sum, item) => sum + item.sources.length, 0),
        measuredAreas: 0,
        reason: "Preflight and plan runs do not compare competitors; only a fresh full audit can attach current product evidence.",
        areas: [],
      },
      proposals: [],
    };
  }

  const freshAudit = reportSourceAuditStatus(report) === "PASS";
  const byCompetitor = new Map(manifest.competitors.map(item => [item.id, item]));
  const proposals = [];
  let measuredAreas = 0;
  const areas = manifest.areas.map(area => {
    const checks = taggedChecks(report, area.id);
    const passing = checks.filter(check => check.status === "PASS");
    const nonPassing = checks.filter(check => check.status !== "PASS");
    const metricResults = compareMeasurements({
      ...area,
      _competitors: byCompetitor,
    }, checks);
    const belowReference = metricResults.some(item => item.status === "BELOW_REFERENCE");
    const comparable = metricResults.length > 0 &&
      metricResults.every(item => item.status === "AT_OR_ABOVE_REFERENCE");
    if (freshAudit && currentEvidence && comparable) measuredAreas++;
    const status = !currentEvidence
      ? "STALE_COMPETITOR_EVIDENCE"
      : !freshAudit
        ? "STALE_OR_UNVERIFIED_PRODUCT_AUDIT"
        : comparable
          ? "AT_OR_ABOVE_CAPTURED_REFERENCE"
          : checks.length === 0
            ? "NO_MAPPED_CURRENT_PRODUCT_EVIDENCE"
            : "NOT_COMPARABLE_OR_BELOW_REFERENCE";
    const competitors = area.competitorIds.map(id => {
      const item = byCompetitor.get(id);
      return { id: item.id, name: item.name, role: item.role };
    });
    if (!comparable || !freshAudit || !currentEvidence) {
      const sources = area.competitorIds.flatMap(id =>
        byCompetitor.get(id).sources.map(source => ({
          competitorId: id,
          url: source.url,
          claim: source.claim,
        })));
      proposals.push({
        id: sha256(`${area.id}:${report?.integrity?.reportSha256 ?? "unsealed"}`).slice(0, 24),
        proposalKey: sha256(`benchmark:${area.id}`),
        kind: "competitor-benchmark-evidence-gap",
        state: "NEEDS_REVIEW",
        priority: "P3",
        productArea: area.id,
        status,
        requiredEvidence: area.acceptanceCriteria,
        competitorSources: sources,
        currentChecks: checks.map(check => ({ id: check.id, status: check.status })),
        metricComparisons: metricResults,
        recommendedNextAction: !currentEvidence
          ? "Refresh the public competitor evidence snapshot from its official sources and review the claims."
          : !freshAudit
            ? "Run a fresh full product audit before comparing current Max Booster behavior."
            : belowReference
              ? "Review the measured below-reference result, identify a product improvement, and preserve the current measurement instead of weakening the gate."
            : "Add passing source-bound checks with same-scope metric measurements; keep unmeasured competitor comparisons explicitly unverified.",
      });
    }
    return {
      id: area.id,
      title: area.title,
      competitors,
      status,
      passingCheckIds: passing.map(check => check.id),
      nonPassingChecks: nonPassing.map(check => ({ id: check.id, status: check.status })),
      metricComparisons: metricResults,
      acceptanceCriteria: area.acceptanceCriteria,
    };
  });

  const complete = currentEvidence && freshAudit && measuredAreas === areas.length;
  return {
    summary: {
      competitorComparisons: complete ? "MEASURED_AGAINST_CAPTURED_REFERENCES" : "EVIDENCE_GAPS",
      evidenceStatus: currentEvidence ? "CURRENT_PUBLIC_CLAIMS" : "STALE_PUBLIC_CLAIMS",
      evidenceCapturedAt: manifest.collectedAt,
      evidenceManifestSha256: manifestSha256,
      coveredProductAreas: areas.length,
      sourceCount: manifest.competitors.reduce((sum, item) => sum + item.sources.length, 0),
      measuredAreas,
      sourceAudit: freshAudit ? "CURRENT" : "UNVERIFIED",
      reason: "Sources are first-party marketing statements, not independently verified product outcomes. Head-to-head status requires a fresh full audit and passing same-scope measurements; no feature pass alone proves superiority.",
      limitations: manifest.methodology.limitations,
      areas,
    },
    proposals,
  };
}
