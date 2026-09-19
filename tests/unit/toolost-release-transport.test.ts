import { beforeEach, describe, expect, it, vi } from "vitest";

const getToolostConnection = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getToolostConnection,
    upsertToolostConnection: vi.fn(),
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("Too Lost release transport", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.TOOLOST_CLIENT_ID = "test-client";
    process.env.TOOLOST_CLIENT_SECRET = "test-secret";
    process.env.TOOLOST_ENVIRONMENT = "production";
    getToolostConnection.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
      connectedByUserId: "user-1",
    });
  });

  it("sends explicit compliance declarations through the real Too Lost choreography", async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        const body =
          typeof init?.body === "string" ? init.body : undefined;
        requests.push({ url, method, body });

        if (url === "https://audio.example/track.flac") {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "audio/wav" },
          });
        }
        if (url === "https://upload.example/track") {
          return new Response(null, { status: 200 });
        }
        if (url.endsWith("/releases") && method === "POST") {
          return Response.json({ data: { id: "too-lost-release-1" } });
        }
        if (url.endsWith("/tracks/upload-url")) {
          return Response.json({
            data: {
              uploadUrl: "https://upload.example/track",
              fileKey: "tracks/track.flac",
            },
          });
        }
        if (url.endsWith("/releases/too-lost-release-1")) {
          return Response.json({
            data: {
              id: "too-lost-release-1",
              status: "in_review",
              delivery: {
                platforms: [{ platform: "spotify", status: "processing" }],
              },
            },
          });
        }
        return Response.json({ data: { status: true } });
      }),
    );

    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );
    const result = await toolostService.forUser("user-1").createRelease({
      title: "Release",
      artist: "Artist",
      releaseType: "Single",
      language: "en",
      composerName: "Composer",
      acceptTerms: true,
      confirmRights: true,
      releaseDate: "2026-01-01",
      artwork: "https://art.example/cover.jpg",
      genre: "Pop",
      platforms: ["spotify"],
      artworkAiUsage: "none",
      tracks: [
        {
          title: "Track",
          artist: "Artist",
          audioFile: "https://audio.example/track.flac",
          duration: 180,
          trackNumber: 1,
          audioAiUsage: "none",
          compositionAiUsage: "none",
        },
      ],
    });

    expect(result.releaseId).toBe("too-lost-release-1");
    const draftCreate = requests.find(
      (request) =>
        request.method === "POST" && request.url.endsWith("/releases"),
    );
    expect(JSON.parse(draftCreate?.body || "{}")).toMatchObject({
      type: "Single",
      participants: [{ name: "Artist", role: ["primary"] }],
    });
    const uploadUrlRequest = requests.find((request) =>
      request.url.endsWith("/tracks/upload-url"),
    );
    expect(JSON.parse(uploadUrlRequest?.body || "{}")).toMatchObject({
      kind: "audio",
      contentType: "audio/flac",
    });
    const trackReplace = requests.find(
      (request) =>
        request.method === "PUT" &&
        request.url.endsWith("/releases/too-lost-release-1/tracks"),
    );
    expect(JSON.parse(trackReplace?.body || "{}").tracks[0].aiAssisted).toBe(
      false,
    );
    const metadataUpdate = requests.find(
      (request) =>
        request.method === "PATCH" &&
        request.url.endsWith("/releases/too-lost-release-1/metadata"),
    );
    expect(JSON.parse(metadataUpdate?.body || "{}").isAiGenerated).toBe(false);
    const deliveryUpdate = requests.find(
      (request) =>
        request.method === "PATCH" &&
        request.url.endsWith("/releases/too-lost-release-1/delivery"),
    );
    expect(JSON.parse(deliveryUpdate?.body || "{}").delivery.platforms).toEqual([
      "spotify",
    ]);
    expect(JSON.parse(trackReplace?.body || "{}").tracks[0].artists).toEqual([
      { name: "Artist", role: ["primary"] },
    ]);
    expect(JSON.parse(trackReplace?.body || "{}").tracks[0].writers).toEqual([
      { name: "Composer", role: ["instrumentalist"] },
    ]);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.url.endsWith("/releases/too-lost-release-1/submit"),
      ),
    ).toBe(true);
  });

  it("blocks before transport when a required declaration is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").createRelease({
        title: "Release",
        artist: "Artist",
        releaseType: "Single",
        language: "en",
        composerName: "Composer",
        acceptTerms: true,
        confirmRights: true,
        releaseDate: "2026-01-01",
        artwork: "https://art.example/cover.jpg",
        genre: "Pop",
        platforms: ["spotify"],
        tracks: [
          {
            title: "Track",
            artist: "Artist",
            audioFile: "https://audio.example/track.flac",
            duration: 180,
            trackNumber: 1,
          },
        ],
      }),
    ).rejects.toThrow("required compliance fields");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never submits after a metadata update rejection", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        requests.push({ url, method });
        if (url === "https://audio.example/track.flac") {
          return new Response(new Uint8Array([1]), { status: 200 });
        }
        if (url === "https://upload.example/track") {
          return new Response(null, { status: 200 });
        }
        if (url.endsWith("/releases") && method === "POST") {
          return Response.json({ data: { id: "release-2" } });
        }
        if (url.endsWith("/tracks/upload-url")) {
          return Response.json({
            data: {
              uploadUrl: "https://upload.example/track",
              fileKey: "tracks/track.flac",
            },
          });
        }
        if (url.endsWith("/release-2/metadata") && method === "PATCH") {
          return Response.json(
            { message: "Invalid metadata" },
            { status: 422 },
          );
        }
        return Response.json({ data: {} });
      }),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").createRelease({
        title: "Release",
        artist: "Artist",
        releaseType: "Single",
        language: "en",
        composerName: "Composer",
        acceptTerms: true,
        confirmRights: true,
        releaseDate: "2026-01-01",
        artwork: "https://art.example/cover.jpg",
        genre: "Pop",
        platforms: ["Spotify"],
        artworkAiUsage: "none",
        tracks: [
          {
            title: "Track",
            artist: "Artist",
            audioFile: "https://audio.example/track.flac",
            duration: 180,
            trackNumber: 1,
            audioAiUsage: "none",
            compositionAiUsage: "none",
          },
        ],
      }),
    ).rejects.toThrow("Invalid metadata");
    expect(
      requests.some(
        (request) =>
          request.method === "POST" && request.url.endsWith("/release-2/submit"),
      ),
    ).toBe(false);
  });

  it("does not guess an undocumented takedown request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").takedownRelease("release-1"),
    ).rejects.toThrow("no confirmed provider API contract");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});