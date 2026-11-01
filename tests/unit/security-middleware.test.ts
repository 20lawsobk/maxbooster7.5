/**
 * Unit tests for security middleware configuration.
 *
 * Verifies that mandatory security middleware is properly configured
 * and references real security primitives, not placeholder values.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

function readSrc(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8");
}

/**
 * Safely evaluates a source-extracted numeric literal expression like
 * "64*1024" or "65536" WITHOUT eval()/Function() — only digits and "*" are
 * accepted, so there is no code-injection surface even though the operand
 * comes from a regex match against a source file.
 */
function evaluateNumericLiteralExpression(expr: string): number {
  if (!/^\d+(\*\d+)*$/.test(expr)) {
    throw new Error(`Unexpected non-numeric maxPayload expression: ${expr}`);
  }
  return expr.split("*").reduce((product, part) => product * Number(part), 1);
}

describe("Mandatory middleware stack", () => {
  const src = readSrc("server/safety/mandatoryMiddleware.ts");

  it("mandatoryMiddleware.ts exists", () => {
    expect(existsSync("server/safety/mandatoryMiddleware.ts")).toBe(true);
  });

  it("applies helmet for security headers", () => {
    expect(src).toContain("helmet");
  });

  it("applies CSRF protection", () => {
    expect(src).toContain("csrf");
  });

  it("applies rate limiting", () => {
    const hasLimit =
      src.includes("rateLimit") ||
      src.includes("rateLimiter") ||
      src.includes("RateLimit");
    expect(hasLimit).toBe(true);
  });
});

describe("Session security", () => {
  // SESSION_SECRET is validated in server/config/env.ts and used in server/config/defaults.ts
  const envSrc = readSrc("server/config/env.ts");
  const defaultsSrc = readSrc("server/config/defaults.ts");

  it("SESSION_SECRET is required and validated in env config", () => {
    expect(envSrc).toContain("SESSION_SECRET");
  });

  it("SESSION_SECRET must be at least 32 characters", () => {
    // env.ts: SESSION_SECRET: z.string().min(32)
    expect(envSrc).toMatch(/SESSION_SECRET[\s\S]{0,60}min\(32\)/);
  });

  it("session secret comes from env var, not hardcoded in defaults", () => {
    // The dev fallback in defaults.ts is acceptable only if it contains a note about production
    expect(defaultsSrc).toContain("SESSION_SECRET");
    expect(defaultsSrc).not.toContain("secret: 'changeme'");
    expect(defaultsSrc).not.toContain('secret: "changeme"');
  });

  it("production check validates SESSION_SECRET is set", () => {
    expect(defaultsSrc).toMatch(
      /SESSION_SECRET[\s\S]{0,200}production|production[\s\S]{0,200}SESSION_SECRET/,
    );
  });
});

describe("WebSocket security", () => {
  // maxPayload is set in server/realtime/ (notification + studio collaboration WS servers)
  const realtimeSrc = readSrc("server/realtime/index.ts");
  const collabSrc = readSrc("server/realtime/studioCollabServer.ts");

  it("notification WebSocket server has a maxPayload limit", () => {
    expect(realtimeSrc).toContain("maxPayload");
  });

  it("studio collab WebSocket server has a maxPayload limit", () => {
    expect(collabSrc).toContain("maxPayload");
  });

  it("notification maxPayload is below 10MB", () => {
    const match = realtimeSrc.match(/maxPayload:\s*([\d_*\s*\d+]+)/);
    if (match) {
      const expr = match[1].replace(/_/g, "").replace(/\s/g, "");
      // e.g. "64*1024" or "65536"
      const bytes = evaluateNumericLiteralExpression(expr);
      expect(bytes).toBeLessThan(10 * 1024 * 1024);
    }
  });

  it("collab maxPayload is at most 50MB", () => {
    const match = collabSrc.match(/maxPayload:\s*([\d_*\s*\d+]+)/);
    if (match) {
      const expr = match[1].replace(/_/g, "").replace(/\s/g, "");
      const bytes = evaluateNumericLiteralExpression(expr);
      expect(bytes).toBeLessThanOrEqual(50 * 1024 * 1024);
    }
  });
});

describe("Error route rate limiting", () => {
  const src = readSrc("server/routes.ts");

  it("/api/errors endpoint has rate limiting via criticalEndpointLimiter", () => {
    // server/routes.ts: app.post("/api/errors", criticalEndpointLimiter, ...)
    expect(src).toContain("criticalEndpointLimiter");
    expect(src).toContain("/api/errors");
  });

  it("criticalEndpointLimiter is imported from globalRateLimiter", () => {
    expect(src).toContain("criticalEndpointLimiter");
    expect(src).toContain("globalRateLimiter");
  });
});
