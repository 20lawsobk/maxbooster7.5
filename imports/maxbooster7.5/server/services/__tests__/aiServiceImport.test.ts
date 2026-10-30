import { describe, expect, it, vi } from "vitest";

const getRedisClient = vi.fn();

vi.mock("../../lib/redisConnectionFactory.js", () => ({
  getRedisClient,
}));

describe("AIService import", () => {
  it("does not seed persistence or start local AI initialization", async () => {
    await import("../aiService.js");
    expect(getRedisClient).not.toHaveBeenCalled();
  });
});