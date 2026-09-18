import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

function normalize(source: string): string {
  return JSON.parse(execFileSync(process.execPath, [
    "--input-type=module", "-e",
    `import {stripRouteTypeArguments} from "./scripts/lib/route-call-source.mjs";
     console.log(JSON.stringify(stripRouteTypeArguments(${JSON.stringify(source)})));`,
  ], { encoding: "utf8" }));
}

describe("typed Express route inventory", () => {
  it("preserves source offsets and paths for nested multiline type arguments", () => {
    const source = `router.post<{
      id: string; context: Record<string, Array<unknown>>
    }>("/projects/:id", requireAuth, handler);`;
    const normalized = normalize(source);
    expect(normalized.length).toBe(source.length);
    expect(normalized.split("\n").length).toBe(source.split("\n").length);
    expect(normalized).toMatch(/router\.post\s*\("\/projects\/:id"/);
    expect(normalized.indexOf('"/projects/:id"')).toBe(source.indexOf('"/projects/:id"'));
  });

  it("does not rewrite route strings or comments containing angle brackets", () => {
    const source = `// router.get<Fake>("/not-a-route")
      router.get<{ kind: ">" } /* > */>("/real", handler);`;
    const normalized = normalize(source);
    expect(normalized).toContain('// router.get<Fake>("/not-a-route")');
    expect(normalized).toMatch(/router\.get\s*\("\/real"/);
  });
});