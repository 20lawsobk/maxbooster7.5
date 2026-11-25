import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../client/src/lib/queryClient";

vi.mock("../../client/src/lib/errorService", () => ({
  errorService: { addBreadcrumb: vi.fn() },
  captureException: vi.fn(),
}));
vi.mock("../../client/src/hooks/use-toast", () => ({ toast: vi.fn() }));

describe("shared apiRequest CSRF handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the double-submit token on state-changing requests", async () => {
    vi.stubGlobal("document", { cookie: "csrf-token=fixture-csrf-value" });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("POST", "/api/training/start", { epochs: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.headers).toMatchObject({
      "x-csrf-token": "fixture-csrf-value",
      "Content-Type": "application/json",
    });
  });
});
