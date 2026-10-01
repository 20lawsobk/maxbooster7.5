import { beforeEach, describe, expect, it, vi } from "vitest";

const submitDistributionOnce = vi.fn();

vi.mock(
  "../../server/services/distributionSubmissionRepository.js",
  () => ({ submitDistributionOnce }),
);

const release = {
  title: "Release",
  artistId: "user-1",
  artistName: "Artist",
  releaseDate: "2026-01-01",
  artworkUrl: "https://art.example/cover.jpg",
  genre: "Pop",
  upc: "123456789012",
  metadata: {
    releaseType: "Single",
    language: "English",
    composerName: "Composer",
    acceptTerms: true,
    confirmRights: true,
    confirmYoutubeRights: true,
    copyrightOwner: "Artist",
    copyrightYear: 2026,
    artworkAiUsage: "none",
    audioAiUsage: "none",
    compositionAiUsage: "none",
  },
};

const tracks = [
  {
    title: "Track",
    artistName: "Artist",
    isrc: "USABC2600001",
    audioUrl: "https://audio.example/track.flac",
    duration: 180,
    trackNumber: 1,
  },
];

describe("shared Too Lost route submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitDistributionOnce.mockImplementation(
      async (
        _provider: string,
        _userId: string,
        _releaseId: string,
        _payload: unknown,
        submit: (checkpoint: (data: Record<string, unknown>) => Promise<void>) => Promise<unknown>,
      ) => submit(vi.fn()),
    );
  });

  it("resolves route aliases against Too Lost's live platform names", async () => {
    const { resolveToolostPlatforms } = await import(
      "../../server/routes/distribution-toolost-submission"
    );
    const catalog = [
      {
        id: "apple-music",
        slug: "apple-music",
        name: "Apple Music",
        category: "streaming" as const,
        region: "global",
        isActive: true,
        processingTime: "3-7 days",
        requirements: {
          isrc: true,
          upc: true,
          metadata: [],
          audioFormats: ["FLAC"],
        },
        deliveryMethod: "api" as const,
      },
    ];

    expect(resolveToolostPlatforms(catalog, ["apple_music"])).toEqual([
      "Apple Music",
    ]);
    expect(() => resolveToolostPlatforms(catalog, ["spotify"])).toThrow(
      'selected store "spotify" is not present',
    );
  });

  it("uses the real Too Lost payload, client, and idempotency provider key", async () => {
    const { submitToolostRelease } = await import(
      "../../server/routes/distribution-toolost-submission"
    );
    const createRelease = vi.fn().mockResolvedValue({
      releaseId: "toolost-1",
      status: "processing",
      platforms: [{ platform: "Spotify", status: "processing" }],
    });
    const client = {
      getAvailableDSPs: vi.fn().mockResolvedValue({
        dsps: [
          {
            id: "spotify",
            slug: "spotify",
            name: "Spotify",
            category: "streaming",
            region: "global",
            isActive: true,
            processingTime: "3-7 days",
            requirements: {
              isrc: true,
              upc: true,
              metadata: [],
              audioFormats: ["FLAC"],
            },
            deliveryMethod: "api",
          },
        ],
      }),
      createRelease,
    };

    const submitted = await submitToolostRelease({
      client,
      userId: "user-1",
      releaseId: "release-1",
      release,
      tracks,
      requestedPlatforms: ["spotify"],
    });

    expect(submitDistributionOnce).toHaveBeenCalledWith(
      "toolost",
      "user-1",
      "release-1",
      expect.objectContaining({
        platforms: ["Spotify"],
        acceptTerms: true,
        confirmRights: true,
        confirmYoutubeRights: true,
      }),
      expect.any(Function),
    );
    expect(createRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        platforms: ["Spotify"],
        tracks: [
          expect.objectContaining({
            isrc: "USABC2600001",
            audioFile: "https://audio.example/track.flac",
            audioAiUsage: "none",
            compositionAiUsage: "none",
          }),
        ],
      }),
      expect.any(Function),
    );
    expect(submitted.result.releaseId).toBe("toolost-1");
  });

  it("refuses to manufacture missing rights/compliance declarations", async () => {
    const { buildToolostPayload } = await import(
      "../../server/routes/distribution-toolost-submission"
    );
    const incomplete = {
      ...release,
      metadata: {
        ...(release.metadata as Record<string, unknown>),
        artworkAiUsage: undefined,
      },
    };

    expect(() =>
      buildToolostPayload(incomplete, tracks, ["Spotify"]),
    ).toThrow("explicit AI-involvement declarations");
  });

  it("keeps absent and unknown post-submit evidence pending for reconciliation", async () => {
    const { mapToolostDispatchStatus } = await import(
      "../../server/routes/distribution-toolost-submission"
    );

    expect(mapToolostDispatchStatus(undefined)).toEqual({
      status: "pending",
      accepted: false,
      indeterminate: true,
    });
    expect(mapToolostDispatchStatus("unknown")).toEqual({
      status: "pending",
      accepted: false,
      indeterminate: true,
    });
    expect(mapToolostDispatchStatus("rejected")).toEqual({
      status: "rejected",
      accepted: false,
      indeterminate: false,
    });
    expect(mapToolostDispatchStatus("live")).toEqual({
      status: "live",
      accepted: true,
      indeterminate: false,
    });
  });

  it("permits a release-level retry only when every selected destination is confirmed failed", async () => {
    const { canRetryToolostRelease } = await import(
      "../../server/routes/distribution-toolost-submission"
    );

    expect(canRetryToolostRelease([])).toBe(false);
    expect(
      canRetryToolostRelease(
        [{ status: "failed" }, { status: "processing" }],
        2,
      ),
    ).toBe(false);
    expect(
      canRetryToolostRelease([{ status: "failed" }], 2),
    ).toBe(false);
    expect(
      canRetryToolostRelease(
        [{ status: "failed" }, { status: "rejected" }],
        2,
      ),
    ).toBe(true);
  });

  it("keeps an accepted remote submission pending when every local dispatch write fails", async () => {
    const { deriveToolostSubmissionPersistence } = await import(
      "../../server/routes/distribution-toolost-submission"
    );
    const persistence = deriveToolostSubmissionPersistence(
      [
        { status: "rejected", reason: new Error("database unavailable") },
        { status: "rejected", reason: new Error("database unavailable") },
      ],
      "processing",
    );

    expect(persistence).toEqual({
      accepted: false,
      indeterminate: true,
      status: "pending",
    });
  });

  it("keeps the release pending when one accepted dispatch persisted and another write failed", async () => {
    const { deriveToolostSubmissionPersistence } = await import(
      "../../server/routes/distribution-toolost-submission"
    );

    expect(
      deriveToolostSubmissionPersistence(
        [
          {
            status: "fulfilled",
            value: {
              status: "processing",
              accepted: true,
              indeterminate: false,
            },
          },
          { status: "rejected", reason: new Error("database unavailable") },
        ],
        "processing",
      ),
    ).toEqual({
      accepted: true,
      indeterminate: true,
      status: "pending",
    });
  });

  it("uses provider rejection only when a real rejected outcome was persisted", async () => {
    const { deriveToolostSubmissionPersistence } = await import(
      "../../server/routes/distribution-toolost-submission"
    );

    expect(
      deriveToolostSubmissionPersistence(
        [{
          status: "fulfilled",
          value: {
            status: "rejected",
            accepted: false,
            indeterminate: false,
          },
        }],
        "rejected",
      ),
    ).toEqual({
      accepted: false,
      indeterminate: false,
      status: "rejected",
    });
  });
});