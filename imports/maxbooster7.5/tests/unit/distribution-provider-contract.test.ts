import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const distributionService = readFileSync(
  resolve(process.cwd(), "server/services/distributionService.ts"),
  "utf8",
);
const genericPlatformService = readFileSync(
  resolve(process.cwd(), "server/services/distributionPlatformService.ts"),
  "utf8",
);
const distributionRoutes = readFileSync(
  resolve(process.cwd(), "server/routes/distribution.ts"),
  "utf8",
);
const releaseScheduler = readFileSync(
  resolve(process.cwd(), "server/services/releaseScheduler.ts"),
  "utf8",
);

describe("distribution provider contract", () => {
  it("does not submit new releases through the legacy LabelGrid adapter", () => {
    expect(distributionService).not.toContain("labelGrid.createRelease(");
    expect(distributionService).toContain("Legacy provider submission is disabled");
    expect(distributionService).toContain("Too Lost-backed distribution submission route");
  });

  it("does not fabricate a queue state when no durable worker exists", () => {
    expect(genericPlatformService).toContain("No dispatch was created and no provider request was sent");
    expect(genericPlatformService).not.toContain("setTimeout(");
    expect(genericPlatformService).not.toContain("Successfully queued for");
  });

  it("does not call LabelGrid for new code generation, catalog verification, or payout requests", () => {
    expect(distributionRoutes).not.toContain("labelGridService?.generateISRC");
    expect(distributionRoutes).not.toContain("labelGridService?.generateUPC");
    expect(distributionRoutes).not.toContain("labelGridService?.requestPayout");
    expect(distributionRoutes).not.toContain("labelGridService.verifyDSPCatalog");
    expect(distributionRoutes).toContain("Too Lost catalog verified");
    expect(distributionRoutes).toContain("not stored or sent to a distributor");
  });

  it("does not execute scheduled publishing through the retired adapter", () => {
    const platformPublish = releaseScheduler.slice(
      releaseScheduler.indexOf('case "platform_publish": {'),
      releaseScheduler.indexOf("          default:", releaseScheduler.indexOf('case "platform_publish": {')),
    );
    expect(platformPublish).toContain('status: "unsupported"');
    expect(platformPublish).toContain("No provider request was sent");
    expect(platformPublish).not.toContain("submitToProvider");
  });
});
