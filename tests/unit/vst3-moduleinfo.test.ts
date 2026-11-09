import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const metadataPaths = [
  "VST3/NewProject.vst3/Contents/Resources/moduleinfo.json",
  "ReleasePackage/NewProject.vst3/Contents/Resources/moduleinfo.json",
] as const;

describe("VST3 package metadata", () => {
  it("is strict JSON with complete, non-template product identity in both bundles", () => {
    const modules = metadataPaths.map((relativePath) =>
      JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")),
    );

    expect(modules[0]).toEqual(modules[1]);
    for (const module of modules) {
      expect(module.Name).toBe("Max Booster");
      expect(module["Factory Info"].Vendor).toBe("Max Booster");
      expect(module["Factory Info"].URL).toBe("");
      expect(module["Factory Info"]["E-Mail"]).toBe("");
      expect(module.Classes).toHaveLength(2);
      for (const pluginClass of module.Classes) {
        expect(pluginClass.Vendor).toBe("Max Booster");
        expect(pluginClass.CID).toMatch(/^[0-9A-F]{32}$/);
        expect(pluginClass["Sub Categories"]).toContain("NoOfflineProcess");
      }
      expect(JSON.stringify(module)).not.toMatch(/yourcompany|placeholder/i);
    }
  });
});
