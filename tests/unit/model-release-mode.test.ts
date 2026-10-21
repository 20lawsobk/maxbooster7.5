import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { modelReleaseRequirements } from "../../script/lib/modelRelease";
import { buildEnvironmentDigest } from "../../script/lib/releaseInventory";

it("packages default live awareness without any legacy checkpoint while retaining explicit legacy verification", () => {
  const root = mkdtempSync(join(tmpdir(), "live-release-"));
  try {
    expect(modelReleaseRequirements(root, {})).toEqual([]);
    expect(modelReleaseRequirements(root, { MAXCORE_SERVING_RELEASE: "live-awareness" })).toEqual([]);
    expect(() => modelReleaseRequirements(root, { MAXCORE_SERVING_RELEASE: "legacy" })).toThrow("manifest is missing");
    expect(() => modelReleaseRequirements(root, { MAXCORE_SERVING_RELEASE: "typo" })).toThrow("supports live-awareness");
    expect(buildEnvironmentDigest({ MAXCORE_SERVING_RELEASE: "legacy" })).not.toBe(
      buildEnvironmentDigest({ MAXCORE_SERVING_RELEASE: "live-awareness" }));
  } finally { rmSync(root, { recursive: true }); }
});
