import { describe, expect, it, vi } from "vitest";
import { createTrainingApiFetch } from "../../client/src/lib/trainingApi";

vi.mock("../../client/src/lib/errorService", () => ({
  errorService: { addBreadcrumb: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock("../../client/src/hooks/use-toast", () => ({ toast: vi.fn() }));

describe("training admin API requests", () => {
  it("delegates mutations and parsed request bodies to the shared API client", async () => {
    const responsePayload = { status: "running", accepted: true };
    const request = vi.fn(async () => new Response(JSON.stringify(responsePayload)));
    const fetchTrainingApi = createTrainingApiFetch(request);

    const result = await fetchTrainingApi("/api/training/start", {
      method: "POST",
      body: JSON.stringify({ n_sessions: 2 }),
    });

    expect(request).toHaveBeenCalledWith(
      "POST",
      "/api/training/start",
      { n_sessions: 2 },
    );
    expect(result).toEqual(responsePayload);
  });

  it("uses the shared API client for read-only requests too", async () => {
    const responsePayload = { status: "idle" };
    const request = vi.fn(async () => new Response(JSON.stringify(responsePayload)));
    const fetchTrainingApi = createTrainingApiFetch(request);

    await fetchTrainingApi("/api/training/status");

    expect(request).toHaveBeenCalledWith(
      "GET",
      "/api/training/status",
      undefined,
    );
  });
});
