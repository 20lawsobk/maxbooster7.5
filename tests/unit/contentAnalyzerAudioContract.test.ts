import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../client/src/components/content/ContentAnalyzer.tsx", import.meta.url),
  "utf8",
);

describe("ContentAnalyzer audio upload contract", () => {
  it("uploads raw audio to the owned MaxCore endpoint before analysis", () => {
    expect(source).toContain('kind === "audio"');
    expect(source).toContain('"/api/audio/upload"');
    expect(source).toContain("await ensureCsrfToken()");
    expect(source).toContain('"x-csrf-token": token');
    expect(source).toContain("await analyze(kind, body.url)");
  });

  it("does not invite arbitrary remote audio URLs", () => {
    expect(source).not.toContain("https://example.com/track.mp3");
    expect(source).toContain("Owned audio asset");
    expect(source).toContain('type="file"');
  });
});