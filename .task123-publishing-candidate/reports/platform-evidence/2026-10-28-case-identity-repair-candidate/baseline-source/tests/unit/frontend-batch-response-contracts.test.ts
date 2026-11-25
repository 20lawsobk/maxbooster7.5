import { beforeAll, describe, expect, it, vi } from "vitest";

let parseBatchResultResponse: any;
let parseBatchActionsResponse: any;
let parseBatchJobProgressResponse: any;
let parseBulkActionResponse: any;
let parseBatchProgressResponse: any;
let parseTemplateListResponse: any;
let parseTemplateResponse: any;
let parseBatchTemplateListResponse: any;
let parseBatchTemplateResponse: any;

beforeAll(async () => {
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { href: "http://localhost/" },
  });
  vi.stubGlobal("document", {
    cookie: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  ({ parseBatchResultResponse } = await import(
    "../../client/src/hooks/useBatchAction"
  ));
  ({ parseBatchActionsResponse, parseBatchJobProgressResponse } = await import(
    "../../client/src/hooks/useBatchActions"
  ));
  ({ parseBulkActionResponse } = await import(
    "../../client/src/hooks/useBulkAction"
  ));
  ({ parseBatchProgressResponse } = await import(
    "../../client/src/hooks/useBatchProgress"
  ));
  ({ parseTemplateListResponse, parseTemplateResponse } = await import(
    "../../client/src/hooks/useTemplate"
  ));
  ({ parseBatchTemplateListResponse, parseBatchTemplateResponse } =
    await import(
      "../../client/src/components/batch/BatchTemplateManager"
    ));
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const batchDto = {
  success: ["one"],
  failed: [{ id: "two", error: "not found" }],
  totalRequested: 2,
  totalSucceeded: 1,
  totalFailed: 1,
};

const studioTemplateDto = {
  id: "template-1",
  name: "Recording",
  description: null,
  category: "recording",
  templateData: { trackLayout: [] },
  isBuiltIn: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  usageCount: 0,
};

const batchTemplateDto = {
  id: "batch-template-1",
  name: "Release defaults",
  description: null,
  resource: "releases",
  action: "bulk_operation",
  configuration: { territory: "worldwide" },
  isFavorite: false,
  isShared: false,
  sharedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  usageCount: 0,
};

describe("frontend batch Response contracts", () => {
  it("parses actual Response JSON for every batch action hook", async () => {
    await expect(
      parseBatchResultResponse(jsonResponse(batchDto), ["one", "two"]),
    ).resolves.toMatchObject(batchDto);
    await expect(
      parseBatchActionsResponse(jsonResponse(batchDto), ["one", "two"]),
    ).resolves.toMatchObject(batchDto);
    await expect(
      parseBulkActionResponse(jsonResponse(batchDto), ["one", "two"]),
    ).resolves.toEqual(batchDto);
  });

  it.each(["batch action", "batch actions", "bulk action"])(
    "rejects malformed batch JSON instead of synthesizing successful IDs",
    async (parserName) => {
      const parse = {
        "batch action": parseBatchResultResponse,
        "batch actions": parseBatchActionsResponse,
        "bulk action": parseBulkActionResponse,
      }[parserName];
      await expect(
        parse(jsonResponse({ message: "accepted" }), ["one"]),
      ).rejects.toThrow("invalid response");
    },
  );

  it("rejects mismatched totals and unexpected IDs", async () => {
    await expect(
      parseBatchActionsResponse(
        jsonResponse({
          ...batchDto,
          success: ["invented"],
          totalRequested: 2,
        }),
        ["one", "two"],
      ),
    ).rejects.toThrow("unexpected items");
  });

  it("parses the server progress DTO and rejects malformed terminal states", async () => {
    const progress = {
      jobId: "job-1",
      status: "completed",
      processed: 2,
      total: 2,
      success: 1,
      failed: 1,
      failures: [{ id: "two", error: "not found" }],
      elapsedMs: 20,
    };
    await expect(
      parseBatchJobProgressResponse(jsonResponse(progress), "job-1"),
    ).resolves.toEqual(progress);
    await expect(
      parseBatchProgressResponse(jsonResponse(progress), "job-1"),
    ).resolves.toEqual(progress);
    await expect(
      parseBatchProgressResponse(
        jsonResponse({ ...progress, success: "2" }),
        "job-1",
      ),
    ).rejects.toThrow("invalid response");
  });
});

describe("frontend template Response contracts", () => {
  it("extracts studio template list envelopes and direct mutation DTOs", async () => {
    await expect(
      parseTemplateListResponse(
        jsonResponse({ templates: [studioTemplateDto] }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: "template-1", type: "recording" }),
    ]);
    await expect(
      parseTemplateResponse(jsonResponse(studioTemplateDto)),
    ).resolves.toEqual(
      expect.objectContaining({ id: "template-1", data: { trackLayout: [] } }),
    );
  });

  it("extracts batch template envelopes and direct mutation DTOs", async () => {
    await expect(
      parseBatchTemplateListResponse(
        jsonResponse({ templates: [batchTemplateDto] }),
      ),
    ).resolves.toEqual([batchTemplateDto]);
    await expect(
      parseBatchTemplateResponse(jsonResponse(batchTemplateDto)),
    ).resolves.toEqual(batchTemplateDto);
  });

  it("rejects malformed template payloads before mutation success handlers", async () => {
    await expect(
      parseTemplateResponse(jsonResponse({ name: "missing id" })),
    ).rejects.toThrow("invalid template");
    await expect(
      parseTemplateListResponse(jsonResponse([])),
    ).rejects.toThrow("invalid response");
    await expect(
      parseBatchTemplateResponse(jsonResponse({ success: true })),
    ).rejects.toThrow("invalid template");
  });
});