import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("optimized social drafts use the authenticated MaxCore generator and existing scheduler", async () => {
  const [route, postingService, generator, client, inventory] = await Promise.all([
    read("server/routes/socialMedia.ts"),
    read("server/services/autoPostingServiceV2.ts"),
    read("server/services/autoPostGenerator.ts"),
    read("client/src/pages/SocialMedia.tsx"),
    read("tests/e2e/generation-surface-inventory.json"),
  ]);

  assert.match(route, /router\.post\(\s*["']\/generate-enhanced-content["']\s*,\s*requireAuth\s*,\s*aiRateLimiter/s);
  assert.match(route, /autoPostGenerator\.generateEnhancedContent\(userId/);
  assert.match(route, /generated\.body\?\.trim\(\)/);
  assert.match(generator, /async generateEnhancedContent\(/);
  assert.match(client, /\/api\/social\/generate-enhanced-content/);
  assert.match(client, /button-generate-optimized-draft/);
  assert.match(client, /\/api\/social\/schedule-post/);
  assert.match(postingService, /private async assertPublishingConnections\(/);
  assert.match(postingService, /await this\.assertPublishingConnections\(userId,\s*normalizedPlatforms\)/s);
  assert.match(postingService, /await this\.assertPublishingConnections\(existingPost\.userId,\s*platforms\)/s);
  assert.match(route, /idempotencyKey \|\| randomUUID\(\)/);
  assert.ok(JSON.parse(inventory).surfaces.some((surface) => surface.id === "social-optimized-draft"));
});
