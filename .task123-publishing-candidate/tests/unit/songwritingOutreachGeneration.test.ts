import { describe, expect, it, vi } from "vitest";

const { unifiedGenerateMock, contextMock, selectArmMock, maxCoreGenerateMock } =
  vi.hoisted(() => ({
    unifiedGenerateMock: vi.fn(),
    contextMock: vi.fn(),
    selectArmMock: vi.fn(),
    maxCoreGenerateMock: vi.fn(),
  }));

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/queryCache.js", () => ({
  queryCache: { getOrCompute: vi.fn(), invalidate: vi.fn() },
  createCacheKey: vi.fn(),
}));
vi.mock("../../server/services/unifiedAIController.js", () => ({
  unifiedAIController: { generateContent: unifiedGenerateMock },
}));
vi.mock("../../server/services/musicIndustryContextFilter.js", () => ({
  musicIndustryContextFilter: { getContextForMode: contextMock },
}));
vi.mock("../../server/services/adaptiveGenerationEngine.js", () => ({
  selectArm: selectArmMock,
}));
vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: { generate: maxCoreGenerateMock },
}));
vi.mock("../../server/services/awarenessContext.js", () => ({
  getAwarenessContext: vi.fn().mockResolvedValue({
    contextString: "Verified current industry context.",
  }),
}));

import songwritingRouter from "../../server/routes/songwriting";
import outreachRouter from "../../server/routes/outreach";

function handler(router: any, pathname: string, method: "post") {
  const layer = router.stack.find(
    (candidate: any) =>
      candidate.route?.path === pathname && candidate.route?.methods?.[method],
  );
  if (!layer) throw new Error(`${method.toUpperCase()} ${pathname} is missing`);
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

describe("MaxCore songwriting and outreach outputs", () => {
  it("returns owner-bound lyric and rhyme results with current context", async () => {
    contextMock.mockResolvedValueOnce({
      contextString: "Current music-industry context.",
    });
    selectArmMock.mockImplementationOnce(({ candidates }: { candidates: string[] }) => ({
      chosen: candidates[0],
    }));
    unifiedGenerateMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          caption:
            "Blue lights are waking the city. We write our names against the quiet.",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { caption: "true new through view" },
      });
    const response = responseMock();

    await handler(songwritingRouter, "/ai-assist", "post")(
      {
        user: { id: "artist-1" },
        body: { prompt: "blue", genre: "pop", mood: "uplifting" },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.suggestions).toContain(
      "Blue lights are waking the city",
    );
    expect(response.body.rhymes).toContain("true");
    expect(response.body.chordProgression).toBeTruthy();
    expect(unifiedGenerateMock).toHaveBeenCalledTimes(2);
    expect(unifiedGenerateMock.mock.calls[0][0]).toMatchObject({
      userId: "artist-1",
      extraContext: "Current music-industry context.",
    });
  });

  it("returns unavailable rather than empty or template songwriting output", async () => {
    contextMock.mockResolvedValueOnce(null);
    selectArmMock.mockImplementationOnce(({ candidates }: { candidates: string[] }) => ({
      chosen: candidates[0],
    }));
    unifiedGenerateMock
      .mockResolvedValueOnce({ success: true, data: { caption: "" } })
      .mockResolvedValueOnce({
        success: true,
        data: { caption: "true new through view" },
      });
    const response = responseMock();

    await handler(songwritingRouter, "/ai-assist", "post")(
      { user: { id: "artist-1" }, body: { prompt: "blue" } },
      response,
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: "Failed to generate suggestions",
    });
  });

  it("generates an outreach pitch through MaxCore for the authenticated owner", async () => {
    maxCoreGenerateMock.mockResolvedValueOnce({
      text: "A concise, personalized pitch based on the supplied track details.",
    });
    const response = responseMock();

    await handler(outreachRouter, "/generate-pitch", "post")(
      {
        user: { id: "artist-2" },
        body: {
          recipientName: "Indie Music Blog",
          recipientType: "blog",
          trackTitle: "Night Drive",
          trackGenre: "electronic",
          artistName: "Example Artist",
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.pitchBody).toContain("personalized pitch");
    expect(maxCoreGenerateMock).toHaveBeenCalledWith(
      "/generate/text",
      expect.objectContaining({
        prompt: expect.stringContaining("Night Drive"),
        contextString: "Verified current industry context.",
      }),
      "artist-2",
    );
  });

  it("does not report an empty MaxCore outreach response as generated content", async () => {
    maxCoreGenerateMock.mockResolvedValueOnce({ text: " " });
    const response = responseMock();

    await handler(outreachRouter, "/generate-pitch", "post")(
      {
        user: { id: "artist-2" },
        body: {
          recipientName: "Indie Music Blog",
          recipientType: "blog",
          trackTitle: "Night Drive",
        },
      },
      response,
    );

    expect(response.statusCode).toBe(503);
    expect(response.body.error).toMatch(/temporarily unavailable/i);
  });
});
