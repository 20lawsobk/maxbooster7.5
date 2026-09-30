import { afterEach, describe, expect, it, vi } from "vitest";

const {
  releaseRows,
  trackRows,
  legacyReleaseRows,
  distroReleasesTable,
  distroTracksTable,
  legacyReleasesTable,
} = vi.hoisted(() => ({
  releaseRows: [] as Array<Record<string, any>>,
  trackRows: [] as Array<Record<string, any>>,
  // Rows for the legacy `releases` table (written by the CSV/DDEX catalog
  // importer). Empty in most scenarios here — its only job in this file is
  // to let findExistingReleaseAcrossTables's cross-table check run against a
  // real (if empty) table shape instead of crashing on an unmocked export.
  legacyReleaseRows: [] as Array<Record<string, any>>,
  distroReleasesTable: {
    id: "id",
    artistId: "artistId",
  },
  distroTracksTable: {
    id: "id",
    releaseId: "releaseId",
  },
  legacyReleasesTable: {
    id: "id",
    userId: "userId",
  },
}));

const transaction = vi.hoisted(() => {
  let tail = Promise.resolve();

  const matches = (
    row: Record<string, any>,
    condition: { field: string; value: unknown },
  ) => row[condition.field] === condition.value;

  const tx = {
    async transaction<T>(callback: (savepointTx: typeof tx) => Promise<T>) {
      // Model Drizzle's nested transaction/savepoint behavior closely enough
      // that a failed release cannot leave partial rows in the batch.
      const releaseSnapshot = releaseRows.map((row) => structuredClone(row));
      const trackSnapshot = trackRows.map((row) => structuredClone(row));
      const legacySnapshot = legacyReleaseRows.map((row) =>
        structuredClone(row),
      );
      try {
        return await callback(tx);
      } catch (error) {
        releaseRows.splice(0, releaseRows.length, ...releaseSnapshot);
        trackRows.splice(0, trackRows.length, ...trackSnapshot);
        legacyReleaseRows.splice(
          0,
          legacyReleaseRows.length,
          ...legacySnapshot,
        );
        throw error;
      }
    },
    select() {
      let table: unknown;
      const builder = {
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        where(condition: { field: string; value: unknown }) {
          const rows =
            table === distroReleasesTable
              ? releaseRows
              : table === legacyReleasesTable
                ? legacyReleaseRows
                : trackRows;
          return Promise.resolve(rows.filter((row) => matches(row, condition)));
        },
      };
      return builder;
    },
    insert(table: unknown) {
      return {
        values(value: Record<string, any>) {
          return {
            returning: async () => {
              const row = {
                ...value,
                id:
                  value.id ||
                  `${table === distroReleasesTable ? "release" : "track"}-${Date.now()}-${Math.random()}`,
                status: table === distroReleasesTable ? "draft" : undefined,
              };
              (table === distroReleasesTable ? releaseRows : trackRows).push(
                row,
              );
              return [row];
            },
          };
        },
      };
    },
    update(table: unknown) {
      let update: Record<string, any> = {};
      return {
        set(value: Record<string, any>) {
          update = value;
          return {
            where(condition: { field: string; value: unknown }) {
              return {
                returning: async () => {
                  const rows =
                    table === distroReleasesTable ? releaseRows : trackRows;
                  const updated = rows
                    .filter((row) => matches(row, condition))
                    .map((row) => Object.assign(row, update));
                  return updated;
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    withLock: async <T>(
      _userId: string,
      callback: (tx: typeof tx) => Promise<T>,
    ) => {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      try {
        return await callback(tx);
      } finally {
        unlock();
      }
    },
  };
});

vi.mock("../../server/services/catalogImportLock.js", () => ({
  withCatalogImportLock: transaction.withLock,
}));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
vi.mock("../../server/db.js", () => ({
  db: {},
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));
vi.mock("../../server/seed/distributionPlatforms.js", () => ({
  DISTRIBUTION_PLATFORMS: [
    { slug: "spotify", name: "Spotify", metadata: {} },
    { slug: "apple-music", name: "Apple Music", metadata: {} },
  ],
}));
vi.mock("@shared/schema", () => ({
  distroReleases: distroReleasesTable,
  distroTracks: distroTracksTable,
  releases: legacyReleasesTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => ({ field, value }),
}));

const { distributionDataTransferService, DuplicateCatalogReleaseError } =
  await import("../../server/services/distributionDataTransferService.js");

const release = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: "spotify-release-1",
  externalId: "spotify-release-1",
  platformId: "spotify",
  title: "First Light",
  artistName: "Canonical Artist",
  releaseType: "single",
  releaseDate: "2024-01-01",
  trackCount: 2,
  upc: "123456789012",
  coverUrl: "https://cdn.example/cover.jpg",
  platformUrl: "https://open.spotify.com/album/1",
  platforms: ["spotify"],
  tracks: [
    {
      title: "First Light",
      trackNumber: 1,
      isrc: "US-MXB-24-00001",
      duration: 210,
    },
    {
      title: "Afterglow",
      trackNumber: 2,
      isrc: "US-MXB-24-00002",
      duration: 180,
    },
  ],
  ...overrides,
});

afterEach(() => {
  releaseRows.length = 0;
  trackRows.length = 0;
  legacyReleaseRows.length = 0;
});

describe("catalog import release identity and metadata merging", () => {
  it("repeating an import is idempotent and preserves artwork, tracks, and DSP data", async () => {
    await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [
        release({
          streamingStats: {
            totalStreams: 120,
            platforms: { spotify: { streams: 120, revenue: 1.2 } },
          },
        }),
      ],
      "Canonical Artist",
    );
    await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [
        release({
          id: "spotify-release-1-repeat",
          trackCount: 1,
          tracks: [release().tracks[0]],
          coverUrl: undefined,
          streamingStats: {
            totalStreams: 120,
            platforms: { spotify: { streams: 120, revenue: 1.2 } },
          },
        }),
      ],
      "Canonical Artist",
    );

    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].artworkUrl).toBe("https://cdn.example/cover.jpg");
    expect(releaseRows[0].metadata.coverArtUrl).toBe(
      "https://cdn.example/cover.jpg",
    );
    expect(releaseRows[0].metadata.tracks).toHaveLength(2);
    expect(releaseRows[0].metadata.streamingStats.totalStreams).toBe(120);
    expect(releaseRows[0].metadata.distributionPlatforms).toEqual([
      "spotify",
    ]);
    expect(trackRows).toHaveLength(2);
  });

  it("merges the same release across providers by title when one lacks a UPC", async () => {
    await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [release()],
      "Canonical Artist",
    );
    await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "apple_music",
      [
        release({
          id: "apple-release-1",
          platformId: "apple_music",
          platformUrl: "https://music.apple.com/album/1",
          platforms: ["apple_music"],
          upc: undefined,
          tracks: [
            {
              title: "First Light",
              trackNumber: 1,
              isrc: "US-MXB-24-00001",
              duration: 211,
            },
          ],
        }),
      ],
      "Canonical Artist",
    );

    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].metadata.upc).toBe("123456789012");
    expect(releaseRows[0].metadata.distributionPlatforms).toEqual([
      "spotify",
      "apple_music",
    ]);
    expect(releaseRows[0].metadata.distributionPlatformLinks).toMatchObject({
      spotify: "https://open.spotify.com/album/1",
      apple_music: "https://music.apple.com/album/1",
    });
    expect(releaseRows[0].metadata.tracks[0].duration).toBe(211);
  });

  it("serializes concurrent imports and fails closed for a namesake artist", async () => {
    await Promise.all([
      distributionDataTransferService.importProfileCatalog(
        "user-1",
        "spotify",
        [release({ id: "a" })],
        "Canonical Artist",
      ),
      distributionDataTransferService.importProfileCatalog(
        "user-1",
        "apple_music",
        [
          release({
            id: "b",
            platformId: "apple_music",
            upc: undefined,
          }),
        ],
        "Canonical Artist",
      ),
    ]);
    await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [release({ artistName: "Different Artist" })],
      "Canonical Artist",
    );

    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].metadata.artistName).toBe("Canonical Artist");
    expect(releaseRows[0].metadata.distributionPlatforms).toEqual([
      "spotify",
      "apple_music",
    ]);
  });
});

describe("cross-table duplicate detection (legacy `releases` table)", () => {
  it("importProfileCatalog skips a release that already exists in the legacy releases table instead of duplicating it", async () => {
    legacyReleaseRows.push({
      id: "legacy-release-1",
      userId: "user-1",
      title: "First Light",
      upc: "123456789012",
      metadata: { artistName: "Canonical Artist" },
    });

    const job = await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [release()],
      "Canonical Artist",
    );

    // Skipped, not failed: the release already exists (just in the other
    // table), so the desired end state — no duplicate — is already true.
    expect(job.successItems).toBe(1);
    expect(job.failedItems).toBe(0);
    expect(job.errors).toHaveLength(0);
    expect(releaseRows).toHaveLength(0);
    expect(trackRows).toHaveLength(0);
  });

  it("importProfileCatalog still imports a genuinely different release when an unrelated legacy row exists", async () => {
    legacyReleaseRows.push({
      id: "legacy-release-1",
      userId: "user-1",
      title: "A Completely Different Release",
      upc: "999999999999",
      metadata: { artistName: "Canonical Artist" },
    });

    const job = await distributionDataTransferService.importProfileCatalog(
      "user-1",
      "spotify",
      [release()],
      "Canonical Artist",
    );

    expect(job.successItems).toBe(1);
    expect(job.failedItems).toBe(0);
    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].title).toBe("First Light");
  });

  it("importCatalogRelease throws a clear, distinguishable error instead of creating a duplicate", async () => {
    legacyReleaseRows.push({
      id: "legacy-release-1",
      userId: "user-1",
      title: "First Light",
      upc: "123456789012",
      metadata: { artistName: "Canonical Artist" },
    });

    await expect(
      distributionDataTransferService.importCatalogRelease(
        "user-1",
        "spotify",
        "Canonical Artist",
        { title: "First Light", upc: "123456789012" },
      ),
    ).rejects.toThrow(DuplicateCatalogReleaseError);

    expect(releaseRows).toHaveLength(0);
  });

  it("importCatalogRelease succeeds normally when no cross-table duplicate exists", async () => {
    const result = await distributionDataTransferService.importCatalogRelease(
      "user-1",
      "spotify",
      "Canonical Artist",
      { title: "Brand New Single", upc: "111111111111" },
    );

    expect(result.title).toBe("Brand New Single");
    expect(releaseRows).toHaveLength(1);
  });
});