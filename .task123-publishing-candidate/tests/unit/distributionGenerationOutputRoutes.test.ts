import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  selectLimitMock,
  updateReturningMock,
  storageMock,
  storageDownloadMock,
  resolveAudioMock,
  audioMetadataMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const queryChain: Record<string, ReturnType<typeof vi.fn>> = {};
  queryChain.from = vi.fn(() => queryChain);
  queryChain.where = vi.fn(() => queryChain);
  queryChain.orderBy = vi.fn(() => queryChain);
  queryChain.limit = selectLimitMock;

  const updateReturningMock = vi.fn();
  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
  updateChain.set = vi.fn(() => updateChain);
  updateChain.where = vi.fn(() => updateChain);
  updateChain.returning = updateReturningMock;

  const tx = { update: vi.fn(() => updateChain) };
  const dbMock = {
    select: vi.fn(() => queryChain),
    update: vi.fn(() => updateChain),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const storageMock = { getDistroRelease: vi.fn() };
  const storageDownloadMock = vi.fn();
  const resolveAudioMock = vi.fn();
  const audioMetadataMock = { extractFromStream: vi.fn() };
  return {
    dbMock,
    selectLimitMock,
    updateReturningMock,
    storageMock,
    storageDownloadMock,
    resolveAudioMock,
    audioMetadataMock,
  };
});

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/services/storageService.js", () => ({
  storageService: { downloadFile: storageDownloadMock },
}));
vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/services/audioSourceResolver.js", () => ({
  resolveAudioUrlToLocalFile: resolveAudioMock,
}));
vi.mock("../../server/services/audioMetadataService.js", () => ({
  audioMetadataService: audioMetadataMock,
}));
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({
      format: "png",
      width: 3000,
      height: 3000,
    }),
  })),
}));

import distributionRouter from "../../server/routes/distribution.js";

let tempDirectory = "";

function routeHandler(pathname: string, method: "get" | "post") {
  const layer = (distributionRouter as any).stack.find(
    (candidate: any) =>
      candidate.route?.path === pathname && candidate.route?.methods?.[method],
  );
  if (!layer) throw new Error(`${method.toUpperCase()} ${pathname} not registered`);
  return layer.route.stack.at(-1).handle;
}

function responseMock() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((status: number) => {
      response.statusCode = status;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

beforeEach(() => {
  selectLimitMock.mockReset();
  updateReturningMock.mockReset();
  updateReturningMock.mockResolvedValue([{ id: "track-1" }]);
  dbMock.update.mockClear();
  storageMock.getDistroRelease.mockReset();
  storageDownloadMock.mockReset();
  resolveAudioMock.mockReset();
  audioMetadataMock.extractFromStream.mockReset();
});

afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = "";
  }
});

describe("distribution generation outputs", () => {
  it("creates and persists an exact digest only for the owner's stored audio", async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "distribution-route-"));
    const bytes = Buffer.from("test audio bytes");
    const localPath = path.join(tempDirectory, "owned.wav");
    await writeFile(localPath, bytes);
    storageMock.getDistroRelease.mockResolvedValue({
      id: "release-1",
      artistId: "artist-1",
    });
    selectLimitMock.mockResolvedValueOnce([
      {
        id: "track-1",
        releaseId: "release-1",
        audioUrl: "/api/storage/file/users/artist-1/audio/owned.wav",
        metadata: {},
      },
    ]);
    resolveAudioMock.mockResolvedValue({
      localPath,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    audioMetadataMock.extractFromStream.mockResolvedValue({
      codec: "WAVE",
      duration: 1,
    });
    const response = responseMock();

    await routeHandler("/content-id/generate", "post")(
      {
        user: { id: "artist-1" },
        body: { releaseId: "release-1", trackId: "track-1" },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: "fingerprint_generated",
      algorithm: "sha256-file-exact",
      fingerprint: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
    });
    expect(resolveAudioMock).toHaveBeenCalledOnce();
    expect(updateReturningMock).toHaveBeenCalledOnce();
  });

  it("rejects remote or other-account audio without making a network fetch", async () => {
    storageMock.getDistroRelease.mockResolvedValue({
      id: "release-1",
      artistId: "artist-1",
    });
    selectLimitMock.mockResolvedValueOnce([
      {
        id: "track-1",
        releaseId: "release-1",
        audioUrl: "https://untrusted.example/audio.wav",
        metadata: {},
      },
    ]);
    const response = responseMock();

    await routeHandler("/content-id/generate", "post")(
      {
        user: { id: "artist-1" },
        body: { releaseId: "release-1", trackId: "track-1" },
      },
      response,
    );

    expect(response.statusCode).toBe(422);
    expect(response.body.error).toBe("owner_audio_access_denied");
    expect(resolveAudioMock).not.toHaveBeenCalled();
    expect(updateReturningMock).not.toHaveBeenCalled();
  });

  it("does not claim platform Content ID registration without a provider", async () => {
    const response = responseMock();
    await routeHandler("/content-id/register", "post")({ body: {} }, response);

    expect(response.statusCode).toBe(501);
    expect(response.body).toMatchObject({
      success: false,
      error: "content_id_provider_unavailable",
    });
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("does not expose another owner's DDEX release", async () => {
    storageMock.getDistroRelease.mockResolvedValue({
      id: "release-1",
      artistId: "different-owner",
    });
    const response = responseMock();

    await routeHandler("/releases/:id/ddex/preview", "post")(
      { user: { id: "artist-1" }, params: { id: "release-1" } },
      response,
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "Release not found" });
  });

  it("blocks DDEX preview when required metadata is missing", async () => {
    selectLimitMock.mockResolvedValueOnce([]);
    storageMock.getDistroRelease.mockResolvedValue({
      id: "release-1",
      artistId: "artist-1",
      title: "Draft",
      releaseDate: null,
      artworkUrl: null,
      metadata: {},
    });
    const response = responseMock();

    await routeHandler("/releases/:id/ddex/preview", "post")(
      { user: { id: "artist-1" }, params: { id: "release-1" } },
      response,
    );

    expect(response.statusCode).toBe(422);
    expect(response.body.error).toBe("ddex_preview_unavailable");
  });

  it("previews a DDEX release using the owner's actual distribution artwork key", async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "distribution-ddex-"));
    const audioPath = path.join(tempDirectory, "track.wav");
    await writeFile(audioPath, Buffer.from("test audio bytes"));
    const release = {
      id: "release-1",
      artistId: "artist-1",
      title: "Test Release",
      releaseDate: new Date("2026-11-12T00:00:00.000Z"),
      artworkUrl:
        "/api/storage/file/distribution%2Fartwork%2Fartist-1%2Fcover.png",
      metadata: {
        artistName: "Test Artist",
        releaseType: "single",
        primaryGenre: "Pop",
        labelName: "Test Label",
        copyrightYear: 2026,
        copyrightOwner: "Test Artist",
        publishingRights: "Independent",
        language: "English",
        upc: "036000291452",
        isExplicit: false,
        territories: ["Worldwide"],
      },
    };
    storageMock.getDistroRelease.mockResolvedValue(release);
    selectLimitMock
      .mockResolvedValueOnce([
        {
          id: "track-1",
          releaseId: "release-1",
          title: "Test Track",
          trackNumber: 1,
          isrc: "USABC1234567",
          audioUrl:
            "/api/storage/file/users%2Fartist-1%2Faudio%2Ftrack.wav",
          metadata: { explicit: false },
        },
      ])
      .mockResolvedValueOnce([{ upc: "036000291452" }])
      .mockResolvedValueOnce([{ isrc: "USABC1234567" }]);
    storageDownloadMock.mockResolvedValue(Buffer.from("test png"));
    resolveAudioMock.mockResolvedValue({
      localPath: audioPath,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    audioMetadataMock.extractFromStream.mockResolvedValue({
      codec: "WAVE",
      duration: 12,
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      bitrate: 1411200,
    });
    const response = responseMock();

    await routeHandler("/releases/:id/ddex/preview", "post")(
      { user: { id: "artist-1" }, params: { id: "release-1" } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.xml).toContain("Test Release");
    expect(response.body.validation).toMatchObject({
      valid: true,
      ddexSchemaValidated: false,
      distributorAccepted: false,
    });
    expect(storageDownloadMock).toHaveBeenCalledWith(
      "distribution/artwork/artist-1/cover.png",
    );
  });
});
