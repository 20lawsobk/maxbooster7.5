import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("client/src/pages/Advertisement.tsx", "utf8");
const variantSource = readFileSync(
  "client/src/components/advertising/CreativeVariantGenerator.tsx",
  "utf8",
);
const routeSource = readFileSync("server/routes/advertising.ts", "utf8");
const socialPageSource = readFileSync("client/src/pages/SocialMedia.tsx", "utf8");
const socialRouteSource = readFileSync("server/routes/socialMedia.ts", "utf8");

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
    expect(routeSource).toContain("generateAdsDirect({");
    expect(routeSource).not.toContain('"/api/generate/content"');
    expect(routeSource).toContain('"/api/generate/image"');
    expect(routeSource).not.toContain("unifiedAIController");
  });

  it("requires complete MaxCore output for each requested text variant", () => {
    expect(routeSource).toContain(
      "advertising campaign generation returned no campaign",
    );
    expect(routeSource).toContain(
      "advertising image generation returned no image",
    );
    expect(routeSource).toContain(
      "MaxCore did not return the requested number of text creatives",
    );
    expect(routeSource).toContain('targetSubtypes: ["text"]');
    expect(routeSource).toContain("replicatePeak: false");
    expect(variantSource).toContain("numCreatives: bulkCount");
    expect(variantSource).toContain("creative.content_type !== \"text\"");
    expect(variantSource).not.toContain("78/100");
  });

  it("forwards manual social controls to the same MaxCore domain path", () => {
    expect(socialPageSource).toContain('"/api/social/generate-content"');
    expect(socialPageSource).toContain(
      "targetAudience: targetAudience.trim() || undefined",
    );
    expect(socialPageSource).toContain("hashtagStrategy,");
    expect(socialPageSource).toContain("captionLength,");
    expect(socialPageSource).toContain("callToActionStrength: ctaStrength");
    expect(socialPageSource).toContain('"/api/multimodal/generate"');

    expect(socialRouteSource).toContain("generateSocialDirect({");
    expect(socialRouteSource).toContain(
      "targetAudience: parsed.data.targetAudience",
    );
    expect(socialRouteSource).toContain(
      "hashtagStrategy: parsed.data.hashtagStrategy",
    );
    expect(socialRouteSource).toContain(
      "captionLength: parsed.data.captionLength",
    );
    expect(socialRouteSource).toContain(
      "callToActionStrength: parsed.data.callToActionStrength",
    );
  });

  it("keeps advertising generation options as copy context, not paid targeting", () => {
    expect(variantSource).toContain("platform: bulkPlatform");
    expect(variantSource).toContain("numCreatives: bulkCount");
    expect(variantSource).toContain(
      "targetAudience: bulkAudience.trim() || undefined",
    );
    expect(routeSource).toContain(
      "Audience context for wording only, not targeting:",
    );
    expect(routeSource).toContain('targetSubtypes: ["text"]');
    expect(routeSource).toContain("replicatePeak: false");
  });
});