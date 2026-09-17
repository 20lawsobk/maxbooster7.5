import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("client/src/pages/Advertisement.tsx", "utf8");
const variantSource = readFileSync(
  "client/src/components/advertising/CreativeVariantGenerator.tsx",
  "utf8",
);
const routeSource = readFileSync("server/routes/advertising.ts", "utf8");

describe("Advertisement generation wiring", () => {
  it("uses the mounted advertising router for every server-backed generator", () => {
    expect(pageSource).toContain("/api/advertising/generate-campaign");
    expect(pageSource).toContain("/api/advertising/generate-image");
    expect(pageSource).toContain("/api/advertising/generate-video");
    expect(pageSource).not.toContain("/api/multimodal/generate");
    expect(variantSource).toContain("/api/advertising/generate-content");
    expect(variantSource).not.toContain("/api/multimodal/generate");
  });

  it("keeps advertisement AI handlers MaxCore-only and fail-explicit", () => {
    expect(routeSource).toContain("MaxCoreAIClient.infer");
    expect(routeSource).toContain("requireMaxCore");
    expect(routeSource).toContain('"/api/platform/ads/generate"');
    expect(routeSource).toContain('"/api/generate/content"');
    expect(routeSource).toContain('"/api/generate/image"');
    expect(routeSource).not.toContain("unifiedAIController");
  });

  it("does not treat an empty generation response as success", () => {
    expect(routeSource).toContain(
      "advertising campaign generation returned no campaign",
    );
    expect(routeSource).toContain(
      "advertising image generation returned no image",
    );
    expect(routeSource).toContain(
      'requireMaxCore(generated, "advertising content generation")',
    );
  });
});