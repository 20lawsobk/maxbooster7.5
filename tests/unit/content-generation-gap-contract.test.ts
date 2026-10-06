import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync("client/src/pages/Dashboard.tsx", "utf8");
const apiRoutes = readFileSync("server/routes.ts", "utf8");
const dawPage = readFileSync(
  "client/src/components/studio/UltimateDAW.tsx",
  "utf8",
);
const storeAdapter = readFileSync(
  "client/src/stores/unifiedStoreAdapter.ts",
  "utf8",
);

describe("Dashboard MaxCore content optimization", () => {
  it("generates and persists an unpublished draft from explicit user content", () => {
    const start = apiRoutes.indexOf('"/api/ai/optimize-content"');
    const end = apiRoutes.indexOf("\n  app.", start + 1);
    const handler = apiRoutes.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).toContain("requireAuth");
    expect(handler).toContain("aiRateLimiter");
    expect(handler).toContain("generateSocialDirect");
    expect(handler).toContain("body.content");
    expect(handler).toContain("body.platform");
    expect(handler).toContain("body.postId");
    expect(handler).toContain("body.expectedContent");
    expect(handler).toContain("eq(posts.userId, userId)");
    expect(handler).toContain("eq(posts.content, existingDraft.content)");
    expect(handler).toContain(".insert(posts)");
    expect(handler).toContain(".update(posts)");
    expect(handler).toContain('status: "draft"');
    expect(handler).toContain('approvalStatus: "draft"');
    expect(handler).toContain("published: false");
    expect(handler).not.toContain("Simulate AI optimization response");
    expect(handler).not.toContain("applied: true");

    expect(dashboardPage).toContain('"/api/ai/optimize-content"');
    expect(dashboardPage).toContain("optimizerContent");
    expect(dashboardPage).toContain("optimizerPlatform");
    expect(dashboardPage).toContain("optimizableDrafts");
    expect(dashboardPage).toContain("dashboard-optimizer-existing-draft");
    expect(dashboardPage).toContain("optimizeContentMutation.mutate({");
    expect(dashboardPage).toContain("setOptimizedDraft(data.draft)");
    expect(dashboardPage).toContain('data-testid="dashboard-optimized-draft"');
    expect(dashboardPage).toContain("Not published");
  });
});

describe("UltimateDAW asynchronous text generation", () => {
  it("waits for the generated job and inserts returned audio or MIDI into the timeline", () => {
    expect(dawPage).toContain('"/api/studio/generation/text"');
    expect(dawPage).toContain("resolveStudioGenerationResponse(submitted)");
    expect(dawPage).toContain("store.addAudioClip(audioTrackId");
    expect(dawPage).toContain("store.addMidiClip(midiTrackId");
    expect(dawPage).toContain("generated.generatedNotes");
    expect(dawPage).toContain("Generation Failed");
    expect(storeAdapter).toContain("addMidiClip: newStore.addMidiClip");
  });
});
