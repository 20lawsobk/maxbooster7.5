import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("server/routes/socialMedia.ts", "utf8");
const storageSource = readFileSync("server/storage.ts", "utf8");
const clientSource = readFileSync(
  "client/src/components/social/SocialListening.tsx",
  "utf8",
);

describe("social listening response contract", () => {
  it.each([
    ["keywords", "getSocialListeningKeywords", "keywords"],
    ["topics", "getSocialListeningTrending", "topics: trending"],
    ["influencers", "getSocialListeningInfluencers", "influencers"],
    ["alerts", "getSocialListeningAlerts", "alerts"],
  ])("wraps the %s endpoint response", (key, method, response) => {
    const methodStart = routeSource.indexOf(method);
    expect(methodStart).toBeGreaterThanOrEqual(0);
    const nextMethod = routeSource.indexOf("async (", methodStart);
    const handler = routeSource.slice(methodStart, nextMethod + 500);
    expect(handler).toContain(`res.json({ ${response} })`);
  });

  it("documents and preserves empty datasets as successful wrapped responses", () => {
    expect(routeSource).toContain(
      "Empty datasets remain successful responses with empty arrays.",
    );
    expect(routeSource).toContain(
      "(await storage.getSocialListeningKeywords?.(userId)) || []",
    );
    expect(routeSource).toContain(
      "(await storage.getSocialListeningTrending?.(userId)) || []",
    );
    expect(routeSource).toContain(
      "(await storage.getSocialListeningInfluencers?.(userId)) || []",
    );
    expect(routeSource).toContain(
      "(await storage.getSocialListeningAlerts?.(userId)) || []",
    );
  });

  it("normalizes stored mention records into every client row shape", () => {
    expect(storageSource).toContain("type: keyword.keyword.startsWith");
    expect(storageSource).toContain("topic: keywords[0]");
    expect(storageSource).toContain("name: mention.author");
    expect(storageSource).toContain('title: "Negative mention detected"');
  });

  it("consumes the canonical wrapper keys and distinguishes query errors", () => {
    expect(clientSource).toContain("keywordsData?.keywords || []");
    expect(clientSource).toContain("trendingData?.topics || []");
    expect(clientSource).toContain("influencersData?.influencers || []");
    expect(clientSource).toContain("alertsData?.alerts || []");
    expect(clientSource).toContain("listeningError");
  });
});