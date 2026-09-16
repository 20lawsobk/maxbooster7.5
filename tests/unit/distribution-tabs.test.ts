import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const distributionSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Distribution.tsx"),
  "utf8",
);

function getTabSource(startMarker: string, endMarker: string): string {
  const start = distributionSource.indexOf(startMarker);
  const end = distributionSource.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(`Could not locate tab source between ${startMarker} and ${endMarker}`);
  }

  return distributionSource.slice(start, end);
}

describe("Distribution tracker tabs", () => {
  it("allows Share & Embed to render before a release is selected", () => {
    const source = readFileSync(
      resolve(process.cwd(), "client/src/components/distribution/EmbedCodeGenerator.tsx"),
      "utf8",
    );
    expect(source).toContain("const slug = selectedRelease?.title");
    expect(source).toContain("selectedRelease?.hyperFollowUrl");
    expect(source).not.toMatch(/const slug = selectedRelease\.title/);
  });
  it("renders pending/error states for A&R stats instead of zero", () => {
    const source = getTabSource(
      "function ARSubmissionsContent()",
      "// ============================================================================\n// SAMPLE CLEARANCE CONTENT",
    );

    expect(source).toContain("isError: statsError");
    expect(source).toContain('value: statsLoading');
    expect(source).toContain('statsError\n                ? "Error"');
    expect(source).toContain('"—"');
    expect(source).toContain("Unable to load A&R submission stats");
    expect(source).toContain("Unable to load A&R submissions");
    expect(source).not.toMatch(/stats\?\.[A-Za-z]+ \?\? 0/);
    expect(source).not.toMatch(/stats\.(total|pending|accepted)\b/);
  });

  it("renders pending/error states for sample stats instead of zero", () => {
    const source = getTabSource(
      "function SampleClearanceContent()",
      "// ============================================================================\n// MUSIC VIDEOS CONTENT",
    );

    expect(source).toContain("isError: statsError");
    expect(source).toContain('value: statsLoading');
    expect(source).toContain('statsError\n                ? "Error"');
    expect(source).toContain('"—"');
    expect(source).toContain("Unable to load sample clearance stats");
    expect(source).toContain("Unable to load sample clearances");
    expect(source).not.toMatch(/stats\?\.[A-Za-z]+ \?\? 0/);
    expect(source).not.toMatch(/stats\.(total|cleared|pending)\b/);
  });
});