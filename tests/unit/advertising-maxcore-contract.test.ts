import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { getMaxcoreOrigin } from "../../server/services/maxcoreConnector.js";
import {
  buildAdGenerationRequest,
  buildAdOptimizationRequest,
  buildImageGenerationRequest,
  extractGeneratedImageUrl,
  mirrorGeneratedImageToPDIM,
} from "../../server/routes/advertising.js";

describe("advertising MaxCore contracts", () => {
  it("sends optimization scoring to the API optimize contract", () => {
    const campaign = { id: "owned-campaign", platform: "instagram" };
    expect(buildAdOptimizationRequest(campaign)).toEqual({
      action: "score",
      campaign,
    });
  });

  it("keeps the selected owned source in the singular ads request", () => {
    expect(
      buildAdGenerationRequest("user-1", {
        title: "Night Drive",
        artist: "A. Artist",
        description: "The selected release description",
        category: "electronic",
        artworkUrl: "/api/storage/file/images/art.png",
        sourceUrl: "https://maxbooster.replit.app/releases/r1",
        sourcePlatform: "maxbooster",
        contentType: "release",
      }, {
        platform: "tiktok",
        intent: "launch",
        direction: { energy: "restrained" },
        context: { releaseId: "r1" },
        awareness: { audience: "warm" },
      }),
    ).toMatchObject({
      user_id: "user-1",
      product: "Night Drive",
      artist_name: "A. Artist",
      platform: "tiktok",
      goal: "streams",
      ad_type: "video",
      genre: "electronic",
      instruction: expect.stringContaining("The selected release description"),
      content_themes: ["release", "Night Drive"],
      intent: "launch",
      direction: { energy: "restrained" },
      context: { releaseId: "r1" },
      awareness: { audience: "warm" },
    });
  });

  it("uses the live UI body to synthesize a normalized advertising slot", () => {
    const uiBody = {
      topic: "new music release",
      platform: "Google Business",
      tone: "energetic",
      goal: "growth",
      artist_name: "A. Artist",
    };
    expect(
      buildImageGenerationRequest({
        prompt: uiBody.topic,
        platform: uiBody.platform,
        tone: uiBody.tone,
        goal: uiBody.goal,
        artist_name: uiBody.artist_name,
        style: "cinematic",
        direction: { palette: "blue" },
        context: { campaignId: "c1" },
        awareness: { avoid: ["text overlay"] },
      }),
    ).toEqual({
      prompt: "new music release",
      slots: [
        {
          id: "advertising-hero",
          platform: "google_business",
          purpose: "growth",
        },
      ],
      intent: "growth",
      style: "cinematic",
      instruction: "Tone: energetic\nGoal: growth\nArtist: A. Artist",
      mood: "energetic",
      content_themes: ["energetic", "growth", "A. Artist"],
      direction: { palette: "blue" },
      context: { campaignId: "c1" },
      awareness: { avoid: ["text overlay"] },
    });
  });

  it("rejects an unsupported platform instead of silently targeting Instagram", () => {
    expect(() =>
      buildImageGenerationRequest({
        prompt: "new music release",
        platform: "not-a-platform",
      }),
    ).toThrow(/unsupported platform/i);
  });

  it("mirrors a mocked /uploads/images response into PDIM", async () => {
    const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "blue" } }).png().toBuffer();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(bytes, {
      headers: { "content-type": "image/png" },
    }));
    const pdim = {
      uploadGeneratedFile: vi.fn().mockResolvedValue("users/user-1/generated-images/generated.png"),
      downloadFile: vi.fn().mockResolvedValue(bytes),
    };
    const url = await mirrorGeneratedImageToPDIM(
      `${getMaxcoreOrigin()}/uploads/images/generated.png`,
      { fetchImpl, storage: pdim as never, ownerId: "user-1" },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(pdim.uploadGeneratedFile).toHaveBeenCalledWith(
      bytes, "user-1", "generated-images", expect.stringMatching(/^[a-f0-9]{64}\.png$/), "image/png",
    );
    expect(pdim.downloadFile).toHaveBeenCalledOnce();
    expect(url).toBe("/api/storage/file/users%2Fuser-1%2Fgenerated-images%2Fgenerated.png");
  });

  it("passes the MaxCore image_url response shape to the server-side mirror", () => {
    const maxcoreResponse = {
      image_url: `${getMaxcoreOrigin()}/uploads/images/generated.png`,
      width: 1024,
      height: 1024,
      format: "png",
    };
    expect(extractGeneratedImageUrl(maxcoreResponse)).toBe(
      `${getMaxcoreOrigin()}/uploads/images/generated.png`,
    );
    expect(
      extractGeneratedImageUrl({
        outputs: [{ url: `${getMaxcoreOrigin()}/uploads/images/legacy.png` }],
      }),
    ).toBe(`${getMaxcoreOrigin()}/uploads/images/legacy.png`);
  });

  it("rejects an image URL outside the MaxCore uploads path", async () => {
    await expect(
      mirrorGeneratedImageToPDIM("https://attacker.invalid/uploads/images/x.png", {
        fetchImpl: vi.fn(), ownerId: "user-1",
      }),
    ).rejects.toThrow("not an allowed /uploads/images asset");
  });
});