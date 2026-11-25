import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCompetitorBenchmarks } from "../scripts/testing/competitor-benchmarks.mjs";

function fullReport(checks = []) {
  return {
    mode: "full",
    checks: [
      {
        id: "launch-readiness-audit",
        status: "PASS",
        output: JSON.stringify({ sourceFreshness: "PASS" }),
      },
      ...checks,
    ],
    integrity: { reportSha256: "a".repeat(64) },
  };
}

test("uses dated official competitor claims but does not infer a win from them", async () => {
  const result = await evaluateCompetitorBenchmarks({
    report: fullReport(),
    now: Date.parse("2026-11-18T00:00:00.000Z"),
  });
  assert.equal(result.summary.competitorComparisons, "EVIDENCE_GAPS");
  assert.equal(result.summary.evidenceStatus, "CURRENT_PUBLIC_CLAIMS");
  assert.equal(result.summary.coveredProductAreas, 7);
  assert.equal(result.summary.sourceCount, 7);
  assert.equal(result.summary.measuredAreas, 0);
  assert.equal(result.proposals.length, 7);
  assert.ok(result.proposals.every(proposal =>
    proposal.state === "NEEDS_REVIEW" && proposal.kind === "competitor-benchmark-evidence-gap"));
  assert.match(result.summary.reason, /not independently verified/);
});

test("only same-scope, same-unit, passing measurements can meet a reference", async () => {
  const result = await evaluateCompetitorBenchmarks({
    report: fullReport([{
      id: "distribution:store-count",
      status: "PASS",
      benchmarkAreaIds: ["distribution"],
      benchmarkMeasurements: [
        {
          metricId: "digital-stores",
          value: 151,
          unit: "stores",
          scope: "Online music stores claimed by a digital distribution service",
        },
        {
          metricId: "streaming-revenue-share",
          value: 100,
          unit: "percent",
          scope: "Streaming revenue share claimed by a digital distribution service",
        },
      ],
    }]),
    now: Date.parse("2026-11-18T00:00:00.000Z"),
  });
  const distribution = result.summary.areas.find(area => area.id === "distribution");
  assert.equal(distribution.status, "AT_OR_ABOVE_CAPTURED_REFERENCE");
  assert.deepEqual(distribution.metricComparisons.map(item => item.status), [
    "AT_OR_ABOVE_REFERENCE",
    "AT_OR_ABOVE_REFERENCE",
  ]);
  assert.equal(result.summary.competitorComparisons, "EVIDENCE_GAPS");
});

test("keeps a below-reference result intact and proposes improvement instead of weakening the gate", async () => {
  const result = await evaluateCompetitorBenchmarks({
    report: fullReport([{
      id: "distribution:store-count",
      status: "PASS",
      benchmarkAreaIds: ["distribution"],
      benchmarkMeasurements: [{
        metricId: "digital-stores",
        value: 12,
        unit: "stores",
        scope: "Online music stores claimed by a digital distribution service",
      }],
    }]),
    now: Date.parse("2026-11-18T00:00:00.000Z"),
  });
  const proposal = result.proposals.find(item => item.productArea === "distribution");
  assert.equal(proposal.metricComparisons.find(item => item.metricId === "digital-stores").status,
    "BELOW_REFERENCE");
  assert.match(proposal.recommendedNextAction, /preserve the current measurement/);
});

test("marks expired evidence stale and does not compare it to a current run", async () => {
  const result = await evaluateCompetitorBenchmarks({
    report: fullReport(),
    now: Date.parse("2027-01-01T00:00:00.000Z"),
  });
  assert.equal(result.summary.evidenceStatus, "STALE_PUBLIC_CLAIMS");
  assert.equal(result.summary.competitorComparisons, "EVIDENCE_GAPS");
  assert.ok(result.summary.areas.every(area => area.status === "STALE_COMPETITOR_EVIDENCE"));
});

test("keeps preflight benchmark status separate from full product comparisons", async () => {
  const result = await evaluateCompetitorBenchmarks({
    report: { mode: "preflight", checks: [] },
    now: Date.parse("2026-11-18T00:00:00.000Z"),
  });
  assert.equal(result.summary.competitorComparisons, "NOT_RUN");
  assert.deepEqual(result.proposals, []);
});
