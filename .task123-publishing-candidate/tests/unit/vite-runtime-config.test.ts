import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClientViteConfig } from "../../vite.config";

describe("shared Vite runtime configuration", () => {
  it("keeps the middleware runtime rooted in the client app", () => {
    const config = createClientViteConfig("development");
    expect(config.root).toBe(path.resolve(process.cwd(), "client"));
    expect(config.server.fs.allow).toContain(process.cwd());
    const plugins = config.plugins.flat(Infinity) as Array<{ name?: string }>;
    expect(plugins.some((plugin) => plugin?.name?.includes("tailwindcss")))
      .toBe(true);
  });
});
