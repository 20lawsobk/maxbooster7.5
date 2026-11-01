import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("../../db.js", () => ({ db: mocks }));

import { storageService } from "../storageService.js";

describe("PDIM generated user media tracking", () => {
  beforeEach(() => vi.resetAllMocks());

  it("tracks the same key it stores for owner-scoped retrieval and quota", async () => {
    const upload = vi.spyOn(storageService, "uploadFile").mockResolvedValue("users/u1/generated-audio/uuid/song.wav");
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: "storage-1" }] }) }),
    });
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });

    await expect(storageService.uploadGeneratedFile(Buffer.from("RIFF"), "u1", "generated-audio", "song.wav", "audio/wav"))
      .resolves.toBe("users/u1/generated-audio/uuid/song.wav");
    expect(upload).toHaveBeenCalledWith(Buffer.from("RIFF"), "users/u1/generated-audio", "song.wav", "audio/wav");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1",
      storageId: "storage-1",
      fileKey: "users/u1/generated-audio/uuid/song.wav",
      mimeType: "audio/wav",
      sizeBytes: 4,
    }));
  });

  it("rolls back the PDIM object when tracking fails", async () => {
    vi.spyOn(storageService, "uploadFile").mockResolvedValue("users/u1/generated-audio/uuid/song.wav");
    const remove = vi.spyOn(storageService, "deleteFile").mockResolvedValue(undefined);
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: "storage-1" }] }) }),
    });
    mocks.insert.mockReturnValue({ values: () => Promise.reject(new Error("tracking unavailable")) });

    await expect(storageService.uploadGeneratedFile(Buffer.from("RIFF"), "u1", "generated-audio", "song.wav", "audio/wav"))
      .rejects.toThrow("tracking unavailable");
    expect(remove).toHaveBeenCalledWith("users/u1/generated-audio/uuid/song.wav");
  });

  it("acknowledges a durable receipt only after tracked ownership and digest read-back", async () => {
    const bytes = Buffer.from("actual encoded fixture bytes");
    const rows: any[] = [];
    let selections = 0;
    mocks.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => {
        selections++;
        if (selections === 2) return [{ id: "storage-1" }];
        return rows;
      } }) }),
    }));
    mocks.insert.mockReturnValue({ values: (row: any) => {
      rows.push(row);
      return { onConflictDoNothing: async () => undefined };
    } });
    const provider = (storageService as any).provider;
    const upload = vi.spyOn(provider, "uploadFile").mockResolvedValue("stored");
    const read = vi.spyOn(storageService, "downloadFile").mockResolvedValue(bytes);
    const first: any = await storageService.commitGeneratedArtifact(bytes, "u1", "j1", "song.wav", "audio/wav", { duration: 1 });
    expect(first).toMatchObject({ durable: true, retrievable: true, owner_id: "u1", duration: 1 });
    const second = await storageService.commitGeneratedArtifact(bytes, "u1", "j1", "song.wav", "audio/wav", { duration: 1 });
    expect(second).toEqual(first);
    expect(upload).toHaveBeenCalledTimes(1);
    read.mockResolvedValue(Buffer.from("corrupted"));
    await expect(storageService.commitGeneratedArtifact(bytes, "u1", "j1", "song.wav", "audio/wav", {}))
      .rejects.toThrow("digest mismatch");
    rows[0].userId = "other-owner";
    await expect(storageService.commitGeneratedArtifact(bytes, "u1", "j1", "song.wav", "audio/wav", {}))
      .rejects.toThrow("ownership mismatch");
  });
});