import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
vi.mock("../../server/services/governancePolicyService.js", () => ({ enforceMaintenance: vi.fn() }));
import { isDevDependencyResource, governanceBoundary } from "../../server/middleware/governanceBoundary";
import { enforceMaintenance } from "../../server/services/governancePolicyService";

afterEach(() => vi.unstubAllEnvs());
describe("development dependency recovery resources", () => {
  it("allows only dependency resources, never traversal, server files or production paths", () => {
    vi.stubEnv("NODE_ENV", "development");
    const prefix = `/@fs${path.resolve("node_modules")}/`;
    expect(isDevDependencyResource(`${prefix}.vite/deps/react.js`)).toBe(true);
    expect(isDevDependencyResource(`${prefix}vite/dist/client/env.mjs`)).toBe(true);
    for (const value of [`${prefix}../server/index.js`, `${prefix}%2e%2e/secret.js`, `${prefix}.env`, `${prefix}x/../secret.js`, "/api/admin.js", `/@fs${path.resolve("server")}/index.js`]) {
      expect(isDevDependencyResource(value)).toBe(false);
    }
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevDependencyResource(`${prefix}.vite/deps/react.js`)).toBe(false);
  });
  it("does not consult maintenance policy for a development module", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const next = vi.fn();
    const request = { method: "GET", path: `/@fs${path.resolve("node_modules")}/.vite/deps/react.js` };
    await governanceBoundary(request as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(enforceMaintenance).not.toHaveBeenCalled();
  });
});