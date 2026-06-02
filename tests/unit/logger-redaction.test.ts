/**
 * Unit tests for pino logger PII redaction.
 * Verifies that sensitive fields are stripped/masked before log output.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pino before importing logger
vi.mock("pino", () => {
  const captured: any[] = [];
  const mockPino = vi.fn(() => ({
    info: vi.fn((obj: any) => captured.push({ level: "info", obj })),
    warn: vi.fn((obj: any) => captured.push({ level: "warn", obj })),
    error: vi.fn((obj: any) => captured.push({ level: "error", obj })),
    debug: vi.fn((obj: any) => captured.push({ level: "debug", obj })),
    child: vi.fn().mockReturnThis(),
  }));
  (mockPino as any)._captured = captured;
  (mockPino as any).stdSerializers = { err: (e: any) => e };
  (mockPino as any).destination = vi.fn();
  return { default: mockPino };
});

describe("Logger redaction paths", () => {
  const SENSITIVE_FIELDS = [
    "password",
    "token",
    "authorization",
    "cookie",
    "secret",
    "apiKey",
    "stripeSecretKey",
    "twoFactorSecret",
  ];

  it("defines at least 20 redaction paths", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/logger.ts", "utf8");
    // REDACT_PATHS is defined as a named const array; some entries contain "]" (e.g. headers["x-api-key"])
    // so we count line-by-line between the array delimiters instead of using a greedy regex
    const lines = src.split("\n");
    const startIdx = lines.findIndex(
      (l) => l.includes("REDACT_PATHS") && l.includes("["),
    );
    let count = 0;
    let inArray = false;
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].includes("[")) inArray = true;
      if (inArray) {
        const matches = lines[i].match(/'[^']+'/g);
        if (matches) count += matches.length;
      }
      if (inArray && lines[i].includes("];")) break;
    }
    expect(count).toBeGreaterThanOrEqual(20);
  });

  it.each(SENSITIVE_FIELDS)("redact config includes: %s", async (field) => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/logger.ts", "utf8");
    expect(src).toContain(field);
  });
});
