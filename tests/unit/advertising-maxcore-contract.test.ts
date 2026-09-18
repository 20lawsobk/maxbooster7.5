import { describe, expect, it, vi } from "vitest";
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
    });
  });

  it("mirrors a mocked /uploads/images response into PDIM", async () => {
    const bytes = Buffer.alloc(16);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => bytes,
    });
    const pdim = {
      uploadFile: vi.fn().mockResolvedValue("images/id/generated.png"),
      getDownloadUrl: vi.fn().mockResolvedValue(
        "/api/storage/file/images%2Fid%2Fgenerated.png",
      ),
    };

    const url = await mirrorGeneratedImageToPDIM(
      `${getMaxcoreOrigin()}/uploads/images/generated.png`,
      { fetchImpl, storage: pdim as never },
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(pdim.uploadFile).toHaveBeenCalledWith(
      bytes,
      "images",
      "generated.png",
      "image/png",
    );
    expect(url).toBe("/api/storage/file/images%2Fid%2Fgenerated.png");
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
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow("not an allowed /uploads/images asset");
  });
});