import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, getPocketMock, readFileMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  getPocketMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock("../../server/db.js", () => ({
  db: {
    select: selectMock,
    transaction: vi.fn(),
  },
}));

vi.mock("../../server/services/advancedUrlParser.js", () => ({
  advancedUrlParser: {
    parseUrl: vi.fn(),
    toContentBrief: vi.fn(),
  },
}));

vi.mock("../../server/services/userPocketDimensionService.js", () => ({
  userPocketService: {
    getUserPocket: getPocketMock,
    readFile: readFileMock,
    storeFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

import {
  attachKnowledgeContext,
  autopilotKnowledgeBaseService,
  decodeKnowledgeText,
} from "../../server/services/autopilotKnowledgeBaseService.js";

function setRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  selectMock.mockReturnValue({ from });
  return { where };
}

describe("per-user autopilot knowledge base", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPocketMock.mockResolvedValue({});
    readFileMock.mockResolvedValue(Buffer.from("Artist: Nova. New release: North Star."));
  });

  it("accepts only non-empty valid UTF-8 text", () => {
    expect(decodeKnowledgeText(Buffer.from("  Brand notes\r\nNew release  "))).toBe(
      "Brand notes\nNew release",
    );
    expect(() => decodeKnowledgeText(Buffer.alloc(0))).toThrow("file is empty");
    expect(() => decodeKnowledgeText(Buffer.from([0xc3, 0x28]))).toThrow(
      "valid UTF-8",
    );
    expect(() => decodeKnowledgeText(Buffer.from([0x41, 0x00, 0x42]))).toThrow(
      "binary data",
    );
  });

  it("preserves existing generation context while adding private references", () => {
    const base = { campaignId: "campaign-7" };
    const knowledge = { sources: [{ title: "Brand notes" }] };

    expect(attachKnowledgeContext(base, knowledge)).toEqual({
      campaignId: "campaign-7",
      userKnowledgeBase: knowledge,
    });
    expect(attachKnowledgeContext(base, undefined)).toBe(base);
  });

  it("reads selected source files from the requesting account's own pocket", async () => {
    const fileKey = "autopilot-knowledge/private-brand-guide.md";
    setRows([
      {
        id: "source-1",
        userId: "account-a",
        fileName: "brand-guide.md",
        fileKey,
        mimeType: "text/markdown",
        sizeBytes: 38,
        folder: "autopilot-knowledge",
        metadata: { sourceType: "file", displayName: "Brand guide" },
        uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const context = await autopilotKnowledgeBaseService.getGenerationContext(
      "account-a",
      { topic: "North Star release", platform: "instagram" },
    );

    expect(readFileMock).toHaveBeenCalledOnce();
    expect(readFileMock).toHaveBeenCalledWith("account-a", fileKey);
    expect(context).toMatchObject({
      topic: "North Star release",
      platform: "instagram",
      sources: [
        {
          title: "Brand guide",
          kind: "file",
          referenceText: "Artist: Nova. New release: North Star.",
        },
      ],
    });
  });

  it("does not read any PDIM source when the account has no saved references", async () => {
    setRows([]);

    await expect(
      autopilotKnowledgeBaseService.getGenerationContext("account-a", {
        topic: "new release",
        platform: "instagram",
      }),
    ).resolves.toBeUndefined();
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
