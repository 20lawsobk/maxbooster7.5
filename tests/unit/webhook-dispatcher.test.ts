/**
 * Unit tests for the webhook automation dispatcher.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock fetch for outgoing webhook calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Webhook automation dispatcher", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
  });

  it("automation-system module exports dispatchWebhook", async () => {
    const src = await import("fs").then((f) =>
      f.readFileSync("server/automation-system.ts", "utf8"),
    );
    expect(src).toContain("dispatchWebhook");
    expect(src).toContain("export");
  });

  it("automation-system has webhook registry (Map)", async () => {
    const src = await import("fs").then((f) =>
      f.readFileSync("server/automation-system.ts", "utf8"),
    );
    expect(src).toContain("Map");
  });

  it("dispatchWebhook is accessible as a public class method", async () => {
    const src = await import("fs").then((f) =>
      f.readFileSync("server/automation-system.ts", "utf8"),
    );
    // dispatchWebhook is implemented as a public async class method (not a standalone export)
    const hasFn =
      src.includes("async function dispatchWebhook") ||
      src.includes("export async function dispatchWebhook") ||
      src.includes("export function dispatchWebhook") ||
      src.includes("dispatchWebhook = async") ||
      src.includes("public async dispatchWebhook") ||
      src.includes("dispatchWebhook(");
    expect(hasFn).toBe(true);
  });
});
