/**
 * Focused contract checks for the authenticated multimodal route.
 *
 * MaxCore receives the normalized request from the service, so this suite
 * verifies the app boundary does not let a caller select another user's
 * generation context and that URL inputs are validated before any AI call.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AIUnavailableError } from "../../server/lib/aiSource.js";

const { handleGeneration } = vi.hoisted(() => ({
  handleGeneration: vi.fn(),
}));

vi.mock("../../server/middleware/auth.js", () => ({
  requireAuthOnly: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.user = { id: "session-user", role: "user" } as never;
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    next();
  },
}));

vi.mock("../../server/services/multimodalGenerationService.js", () => ({
  handleGeneration,
}));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("multimodal route request contract", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../../server/routes/multimodal.js");
    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    handleGeneration.mockReset();
    handleGeneration.mockResolvedValue({
      requestId: "request-1",
      assets: [
        {
          id: "asset-1",
          modality: "text",
          payload: "Generated post copy",
          platform: "instagram",
          slotId: "instagram_post",
        },
      ],
      plan: {
        requestId: "request-1",
        steps: [
          {
            id: "step_text_instagram",
            type: "generate",
            worker: "text",
            inputFrom: "normalizedInput",
            params: { platform: "instagram" },
          },
        ],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(body: unknown): Promise<Response> {
    return fetch(`${base}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("binds the generation request to req.user rather than body.userId", async () => {
    const response = await post({
      userId: "another-user",
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(200);
    expect(handleGeneration).toHaveBeenCalledOnce();
    expect(handleGeneration.mock.calls[0][0].userId).toBe("session-user");
  });

  it("preserves explicit caller conditioning without inferring replacements", async () => {
    const awareness = { campaign: "midnight release", avoid: ["humor"] };
    const context = { releaseId: "release-9", audience: "existing fans" };
    const direction = ["minimal", "cinematic"];
    await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
      intent: "announce",
      direction,
      context,
      awareness,
    });

    expect(handleGeneration.mock.calls[0][0]).toMatchObject({
      intent: "announce",
      direction,
      context,
      awareness,
    });
  });

  it("rejects private URL targets before metadata fetching or MaxCore", async () => {
    const response = await post({
      input: { modality: "url", payload: "http://127.0.0.1:9878/api/health" },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("rejects URL credentials through the shared public URL contract", async () => {
    const response = await post({
      input: {
        modality: "url",
        payload: "https://user:password@example.com/article",
      },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("rejects a mixed valid/invalid platform list instead of silently dropping one", async () => {
    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram", "not-a-platform"],
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unsupported input modality instead of defaulting to text", async () => {
    const response = await post({
      input: { modality: "diagram", payload: "announce the single" },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unsupported output modality instead of defaulting to text", async () => {
    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
      constraints: { outputModality: "animation" },
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unsupported pack instead of silently generating a default plan", async () => {
    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
      packId: "not-a-pack",
    });

    expect(response.status).toBe(400);
    expect(handleGeneration).not.toHaveBeenCalled();
  });

  it("does not return success when the service returns no assets", async () => {
    handleGeneration.mockResolvedValueOnce({
      requestId: "request-1",
      assets: [],
      plan: { requestId: "request-1", steps: [] },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(503);
  });

  it("does not expose MaxCore diagnostics in generation error responses", async () => {
    const diagnostic = "private prompt https://internal.example/output?token=sentinel";
    handleGeneration.mockRejectedValueOnce(new Error(diagnostic));

    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(diagnostic);
    expect(body).not.toContain("sentinel");
    expect(body).toContain("Generation failed");
  });

  it("does not expose AI-unavailable feature details in generation responses", async () => {
    const diagnostic = "private prompt and media URL";
    handleGeneration.mockRejectedValueOnce(new AIUnavailableError(diagnostic));

    const response = await post({
      input: { modality: "text", payload: "announce the single" },
      platforms: ["instagram"],
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(diagnostic);
    expect(body).toContain("temporarily unavailable");
  });

  it("passes a public URL as a URL input without substituting body identity", async () => {
    const response = await post({
      userId: "another-user",
      input: {
        modality: "url",
        payload: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(200);
    expect(handleGeneration.mock.calls[0][0]).toMatchObject({
      userId: "session-user",
      input: {
        modality: "url",
        payload: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      },
    });
  });

  it("normalizes a public URL before handing it to the generation service", async () => {
    const response = await post({
      input: {
        modality: "url",
        payload: "  https://example.com/articles/../release  ",
      },
      platforms: ["instagram"],
    });

    expect(response.status).toBe(200);
    expect(handleGeneration.mock.calls[0][0].input.payload).toBe(
      "https://example.com/release",
    );
  });
});