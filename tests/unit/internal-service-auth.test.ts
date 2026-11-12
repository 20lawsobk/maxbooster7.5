import { describe, expect, it } from "vitest";
import { hasBearerSecret } from "../../server/lib/internalServiceAuth.js";

describe("internal service bearer authentication", () => {
  it("accepts only the exact configured bearer secret", () => {
    expect(hasBearerSecret("Bearer correct-secret", "correct-secret")).toBe(true);
    expect(hasBearerSecret("bearer correct-secret", "correct-secret")).toBe(true);
    expect(hasBearerSecret("Bearer wrong-secret", "correct-secret")).toBe(false);
    expect(hasBearerSecret("Basic correct-secret", "correct-secret")).toBe(false);
    expect(hasBearerSecret(undefined, "correct-secret")).toBe(false);
    expect(hasBearerSecret("Bearer correct-secret", undefined)).toBe(false);
    expect(hasBearerSecret("Bearer correct-secret extra", "correct-secret")).toBe(false);
  });
});
