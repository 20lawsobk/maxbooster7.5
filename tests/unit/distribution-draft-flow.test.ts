import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createReleaseDraftSchema } from "../../server/routes/distribution-release-schemas.js";

describe("distribution wizard draft persistence", () => {
  it("accepts a minimal draft with validated royalty splits", () => {
    const parsed = createReleaseDraftSchema.parse({
      title: "  Work in progress  ",
      royaltySplits: [
        {
          name: "Artist One",
          email: "artist@example.com",
          role: "performer",
          percentage: 70,
        },
        {
          name: "Producer Two",
          email: "producer@example.com",
          role: "producer",
          percentage: 30,
        },
      ],
    });

    expect(parsed.title).toBe("Work in progress");
    expect(parsed.royaltySplits).toHaveLength(2);
  });

  it("requires a title and rejects incomplete split totals", () => {
    expect(() => createReleaseDraftSchema.parse({})).toThrow();
    expect(() =>
      createReleaseDraftSchema.parse({
        title: "Draft",
        royaltySplits: [
          {
            name: "Artist One",
            email: "artist@example.com",
            role: "performer",
            percentage: 70,
          },
        ],
      }),
    ).toThrow(/must total 100%/);
  });

  it("sends draft data as JSON and includes royalty splits for save and submit", () => {
    const wizardSource = readFileSync(
      "client/src/components/distribution/ReleaseWizard.tsx",
      "utf8",
    );
    const saveDraftSection = wizardSource.slice(
      wizardSource.indexOf("const saveDraftMutation"),
      wizardSource.indexOf("// Submit for distribution mutation"),
    );

    expect(saveDraftSection).toContain("royaltySplits");
    expect(saveDraftSection).toContain("apiRequest");
    expect(saveDraftSection).not.toContain("new FormData()");
    expect(wizardSource).toContain("draftReleaseId ? \"PATCH\" : \"POST\"");
    expect(wizardSource).toContain("royaltySplits,");
  });
});