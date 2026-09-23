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

  it("does not convert an analytics outage into zero revenue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "provider unavailable" }, { status: 503 }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );
    const client = toolostService.forUser("user-1");

    await expect(client.getReleaseAnalytics("release-1")).rejects.toThrow(
      "analytics unavailable",
    );
  });

  it("rejects a malformed catalog response instead of reporting an empty catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: { unexpected: true } })),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getUserCatalog(),
    ).rejects.toThrow("response was malformed");
  });

  it("loads the durable connection for detail reads instead of trusting the advisory cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            id: "release-1",
            title: "Release",
            type: "single",
            participants: [{ name: "Artist", role: "primary" }],
            tracks: [],
          },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getReleaseDetail("release-1"),
    ).resolves.toMatchObject({ id: "release-1", title: "Release" });
  });

  it("preserves unknown provider statuses instead of inventing processing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            id: "release-1",
            status: "provider_added_state",
            delivery: {
              platforms: [
                { platform: "Spotify", status: "provider_added_state" },
              ],
            },
          },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getReleaseStatus("release-1"),
    ).resolves.toMatchObject({
      status: "unknown",
      platforms: [{ platform: "Spotify", status: "unknown" }],
    });
  });

  it("keeps a successful submit indeterminate when its follow-up GET fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        if (url === "https://audio.example/track.flac") {
          return new Response(new Uint8Array([1]), { status: 200 });
        }
        if (url === "https://upload.example/track") {
          return new Response(null, { status: 200 });
        }
        if (url.endsWith("/releases") && method === "POST") {
          return Response.json({ data: { id: "remote-unknown" } });
        }
        if (url.endsWith("/tracks/upload-url")) {
          return Response.json({
            data: {
              uploadUrl: "https://upload.example/track",
              fileKey: "tracks/track.flac",
            },
          });
        }
        if (
          url.endsWith("/releases/remote-unknown") &&
          method === "GET"
        ) {
          return Response.json({ error: "temporarily unavailable" }, { status: 503 });
        }
        return Response.json({ data: { status: true } });
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
        tracks: [{
          title: "Track",
          artist: "Artist",
          audioFile: "https://audio.example/track.flac",
          duration: 180,
          trackNumber: 1,
          audioAiUsage: "none",
          compositionAiUsage: "none",
        }],
      }),
    ).resolves.toMatchObject({
      releaseId: "remote-unknown",
      status: "unknown",
      platforms: [{ platform: "Spotify", status: "unknown" }],
    });
  });

  it("rejects malformed analytics numbers instead of converting them to zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            currency: "USD",
            period: "2026-01",
            channels: [{ platform: "Spotify", streams: "not-a-number", revenue: 1 }],
          },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getReleaseAnalytics("release-1"),
    ).rejects.toThrow("invalid streams");
  });

  it("returns zero analytics only for a qualified empty channel list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { channels: [], currency: "USD", period: "2026-01" },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getReleaseAnalytics("release-1"),
    ).resolves.toMatchObject({
      totalStreams: 0,
      totalRevenue: 0,
      platforms: {},
    });
  });

  it("allows negative revenue adjustments but rejects negative audience counts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            period: "2026-01",
            channels: [{
              platform: "Spotify",
              streams: 10,
              listeners: 8,
              revenue: -1.25,
              currency: " usd ",
            }],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            period: "2026-01",
            channels: [{
              platform: "Spotify",
              streams: -1,
              revenue: 1,
              currency: "USD",
            }],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );
    const client = toolostService.forUser("user-1");

    await expect(client.getReleaseAnalytics("release-1")).resolves.toMatchObject({
      totalStreams: 10,
      totalRevenue: -1.25,
    });
    await expect(client.getReleaseAnalytics("release-1")).rejects.toThrow(
      "invalid streams",
    );
  });

  it("refuses to sum channel revenue across currencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            period: "2026-01",
            channels: [
              { platform: "Spotify", revenue: 1, currency: " usd " },
              { platform: "Apple Music", revenue: 1, currency: "EUR" },
            ],
          },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getReleaseAnalytics("release-1"),
    ).rejects.toThrow("multiple currencies");
  });

  it.each([null, "", " ", false])(
    "rejects analytics numeric coercion from %j",
    async (invalid) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            data: {
              currency: "USD",
              period: "2026-01",
              channels: [{ platform: "Spotify", streams: invalid }],
            },
          }),
        ),
      );
      const { toolostService } = await import(
        "../../server/services/toolost-service"
      );

      await expect(
        toolostService.forUser("user-1").getReleaseAnalytics("release-1"),
      ).rejects.toThrow("invalid streams");
    },
  );

  it("rejects measure-less analytics rows and unqualified empty lists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            currency: "USD",
            period: "2026-01",
            channels: [{ platform: "Spotify" }],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { channels: [] } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );
    const client = toolostService.forUser("user-1");

    await expect(client.getReleaseAnalytics("release-1")).rejects.toThrow(
      "supported numeric measure",
    );
    await expect(client.getReleaseAnalytics("release-1")).rejects.toThrow(
      "identify a currency",
    );
  });

  it("refuses to combine royalty totals across currencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            rows: [
              { revenue: 10, currency: "USD" },
              { revenue: 8, currency: "EUR" },
            ],
          },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getRoyaltySummary(),
    ).rejects.toThrow("multiple currencies");
  });

  it("does not fabricate zero from an unknown royalty envelope with USD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: { currency: "USD", unexpected: true } }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getRoyaltySummary(),
    ).rejects.toThrow("response was malformed");
  });

  it("accepts a legitimate empty royalty row list and normalizes currency", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: { rows: [], currency: " usd " } }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getRoyaltySummary(),
    ).resolves.toEqual({
      pending: 0,
      available: 0,
      lifetime: 0,
      currency: "USD",
    });
  });

  it("rejects malformed royalty row amounts instead of converting them to zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { rows: [{ revenue: "bad", currency: "USD" }] },
        }),
      ),
    );
    const { toolostService } = await import(
      "../../server/services/toolost-service"
    );

    await expect(
      toolostService.forUser("user-1").getRoyaltySummary(),
    ).rejects.toThrow("invalid revenue");
  });
});