import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildReviewPlan,
  isModelArtifactPath,
  parseLfsPointer,
  parseNulPaths,
} from "../../scripts/testing/review-staged.mjs";

test("review planning runs broad app checks for application code", () => {
  const names = buildReviewPlan([
    "server/routes/collaboration.ts",
    "client/src/pages/Collaborations.tsx",
  ]).map((item) => item.name);

  assert(names.includes("TypeScript"));
  assert(names.includes("Application test suite"));
  assert(names.includes("Client browser tests"));
  assert(names.includes("Changed-file lint"));
});

test("review planning selects checks for Python, Rust, SQL, and shell", () => {
  const root = mkdtempSync(path.join(tmpdir(), "review-gate-"));
  try {
    mkdirSync(path.join(root, "native/pdim/src"), { recursive: true });
    writeFileSync(path.join(root, "native/pdim/Cargo.toml"), "[package]\n");
    const plan = buildReviewPlan(
      [
        "external/maxcore/service.py",
        "native/pdim/src/lib.rs",
        "scripts/build.sh",
        "migrations/0102_example.sql",
      ],
      { root },
    );
    const names = plan.map((item) => item.name);

    assert(names.includes("Python test suites"));
    assert(names.some((name) => name.startsWith("Rust tests:")));
    assert(names.includes("Shell syntax: scripts/build.sh"));
    assert(names.includes("Database schema contract"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review planning keeps documentation-only changes lightweight", () => {
  assert.deepEqual(buildReviewPlan(["docs/operations.md"]), []);
});

test("changed standalone tests get a direct runner", () => {
  const plan = buildReviewPlan(["tests/unit/review-staged.test.mjs"]);
  assert.deepEqual(
    plan.map((item) => item.name),
    ["Changed Node test suites"],
  );
});

test("NUL-delimited Git paths preserve names containing spaces", () => {
  assert.deepEqual(
    parseNulPaths("client/src/A file.tsx\0docs/a b.md\0"),
    ["client/src/A file.tsx", "docs/a b.md"],
  );
});

test("model artifacts must be represented by a valid Git LFS pointer", () => {
  const sha = "a".repeat(64);
  assert.equal(isModelArtifactPath("model.corrupt"), true);
  assert.equal(isModelArtifactPath("external/model.corrupt"), true);
  assert.equal(
    isModelArtifactPath(
      "external/maxcore/ai_model/model/release.safetensors",
    ),
    true,
  );
  assert.equal(isModelArtifactPath("client/model-card.tsx"), false);
  assert.deepEqual(
    parseLfsPointer(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${sha}\nsize 109368185\n`,
    ),
    { sha256: sha, bytes: 109368185 },
  );
  assert.equal(parseLfsPointer("model weights"), null);
});
