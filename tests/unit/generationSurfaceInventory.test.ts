import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Surface = {
  id: string;
  clientFile: string;
  backend: string[];
  maxCorePath: string[];
  modalities: string[];
  ownerBound: boolean;
  verification: string[];
};

const root = process.cwd();
const inventory = JSON.parse(
  readFileSync(path.join(root, "tests/e2e/generation-surface-inventory.json"), "utf8"),
) as { surfaces: Surface[]; nonCreativeOperations: Array<{ clientFile: string }> };

describe("MaxCore generation surface inventory", () => {
  it("lists unique, source-backed client entry points and non-creative generation operations", () => {
    const ids = inventory.surfaces.map(surface => surface.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(inventory.surfaces.length).toBeGreaterThanOrEqual(18);
    for (const surface of inventory.surfaces) {
      expect(surface.clientFile, surface.id).toBeTruthy();
      expect(readFileSync(path.join(root, surface.clientFile), "utf8").length, surface.id).toBeGreaterThan(0);
      expect(surface.backend.length, surface.id).toBeGreaterThan(0);
      expect(surface.maxCorePath.length, surface.id).toBeGreaterThan(0);
      expect(surface.ownerBound, surface.id).toBe(true);
      expect(surface.verification.length, surface.id).toBeGreaterThan(0);
    }
    for (const operation of inventory.nonCreativeOperations) {
      expect(readFileSync(path.join(root, operation.clientFile), "utf8").length).toBeGreaterThan(0);
    }
  });

  it("covers the four modalities without treating procedural media as trained inference", () => {
    const modalities = new Set(inventory.surfaces.flatMap(surface => surface.modalities));
    expect([...modalities]).toEqual(expect.arrayContaining(["text", "image", "audio", "video"]));
    const procedural = inventory.surfaces.find(surface => surface.id === "procedural-media-tool");
    expect(procedural?.result).toMatch(/not evidence of trained media weights/i);
  });

  it("keeps every shared generation endpoint on the canonical awareness map", () => {
    const awareness = readFileSync(path.join(root, "server/services/generationAwareness.ts"), "utf8");
    const endpoints = new Set(inventory.surfaces.flatMap(surface => surface.maxCorePath));
    for (const endpoint of endpoints) {
      expect(awareness, endpoint).toContain(`"${endpoint}"`);
    }
  });

  it("routes studio patterns, autopilot media, and owner-bound content through shared MaxCore clients", () => {
    const studioTransport = readFileSync(path.join(root, "server/services/studioMaxCoreTransport.ts"), "utf8");
    const contentService = readFileSync(path.join(root, "server/services/aiContentService.ts"), "utf8");
    const adapter = readFileSync(path.join(root, "server/services/maxcoreDomainAdapter.ts"), "utf8");
    const unified = readFileSync(path.join(root, "server/services/unifiedAIController.ts"), "utf8");
    const adRunner = readFileSync(path.join(root, "server/services/advertisingAutopilotRunner.ts"), "utf8");
    const socialRoutes = readFileSync(path.join(root, "server/routes/socialMedia.ts"), "utf8");
    const advertisingRoutes = readFileSync(path.join(root, "server/routes/advertising.ts"), "utf8");
    const autoPost = readFileSync(path.join(root, "server/services/autoPostGenerator.ts"), "utf8");
    expect(studioTransport).toContain("MaxCoreAIClient.generate<T>(pathName, body ?? {}, userId");
    expect(contentService).toContain('"/api/generate/image"');
    expect(contentService).toContain("generateMaxCoreAudio");
    expect(adapter).toContain("body.user_id");
    expect(unified).toContain("options.userId");
    expect(adRunner).toContain("userId,");
    expect(socialRoutes).toMatch(
      /MaxCoreAIClient\.infer<McImgResp>\("\/api\/generate\/image",\s*\{[\s\S]*?awareness,\s*\},\s*req\.user!\.id\)/,
    );
    expect(advertisingRoutes).toMatch(
      /MaxCoreAIClient\.infer<Record<string,\s*unknown>>\(\s*"\/api\/platform\/ads\/generate",\s*campaignRequest,\s*userId,/,
    );
    expect(advertisingRoutes).toMatch(
      /MaxCoreAIClient\.infer<McImageResp>\("\/api\/generate\/image",\s*\{[\s\S]*?awareness,\s*\}\),\s*\},\s*req\.user!\.id\)/,
    );
    expect(autoPost.match(
      /MaxCoreAIClient(?:\?)?\.generate<[\s\S]*?>\("\/api\/generate\/content",[\s\S]*?\},\s*userId[),]/g,
    )).toHaveLength(3);
  });
});
