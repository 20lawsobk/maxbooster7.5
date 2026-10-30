/**
 * Unit tests for server/lib/envHelpers.ts
 *
 * Covers the canonical isProductionEnv() helper used across security-critical
 * middleware. The key invariant: REPLIT_DEPLOYMENT=1 must be treated as
 * production even when NODE_ENV is undefined (Replit Reserved VM behaviour).
 */
import { describe, it, expect, afterEach } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  Object.keys(process.env).forEach((k) => {
    if (!(k in originalEnv)) delete process.env[k];
  });
  Object.assign(process.env, originalEnv);
});

async function freshImport() {
  // Force re-evaluation of the module for each test by appending a cache-bust query
  const ts = Date.now();
  const mod = await import(`../../server/lib/envHelpers.js?bust=${ts}`).catch(
    () => import("../../server/lib/envHelpers.js"),
  );
  return mod as { isProductionEnv: () => boolean; isDevEnv: () => boolean };
}

describe("isProductionEnv()", () => {
  it("returns true when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.REPLIT_DEPLOYMENT;
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(true);
  });

  it("returns true when REPLIT_DEPLOYMENT=1 (Reserved VM — NODE_ENV is undefined)", async () => {
    delete process.env.NODE_ENV;
    process.env.REPLIT_DEPLOYMENT = "1";
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(true);
  });

  it("returns true when both NODE_ENV=production and REPLIT_DEPLOYMENT=1", async () => {
    process.env.NODE_ENV = "production";
    process.env.REPLIT_DEPLOYMENT = "1";
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(true);
  });

  it("returns false in development (NODE_ENV=development, no REPLIT_DEPLOYMENT)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.REPLIT_DEPLOYMENT;
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(false);
  });

  it("returns false in test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.REPLIT_DEPLOYMENT;
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(false);
  });

  it("returns false when no env vars are set", async () => {
    delete process.env.NODE_ENV;
    delete process.env.REPLIT_DEPLOYMENT;
    const { isProductionEnv } = await freshImport();
    expect(isProductionEnv()).toBe(false);
  });
});

describe("isDevEnv()", () => {
  it("is the exact inverse of isProductionEnv", async () => {
    const { isProductionEnv, isDevEnv } = await freshImport();
    expect(isDevEnv()).toBe(!isProductionEnv());
  });

  it("returns true in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.REPLIT_DEPLOYMENT;
    const { isDevEnv } = await freshImport();
    expect(isDevEnv()).toBe(true);
  });

  it("returns false in production", async () => {
    process.env.NODE_ENV = "production";
    const { isDevEnv } = await freshImport();
    expect(isDevEnv()).toBe(false);
  });
});
