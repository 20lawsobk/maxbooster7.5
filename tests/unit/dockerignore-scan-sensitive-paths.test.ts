import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { computeRemainingAppMembers } from "../../script/lib/dockerignoreScan.js";

describe("deployment .dockerignore sensitive path coverage", () => {
  it("excludes workspace credentials and local-only files from the app remainder", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "dockerignore-sensitive-paths-"),
    );
    try {
      await fs.copyFile(
        path.join(process.cwd(), ".dockerignore"),
        path.join(temporaryRoot, ".dockerignore"),
      );

      const fixtureFiles = [
        ".npmrc",
        ".env",
        ".env.production",
        ".cloudflared/config.yml",
        "dns-node/keys/signing.key",
        "server/.npmrc",
        "server/.env.preview",
        "server/index.ts",
      ];
      for (const relativeFile of fixtureFiles) {
        const absoluteFile = path.join(temporaryRoot, relativeFile);
        await fs.mkdir(path.dirname(absoluteFile), { recursive: true });
        await fs.writeFile(absoluteFile, "fixture");
      }

      const members = computeRemainingAppMembers(temporaryRoot);
      for (const omitted of fixtureFiles.filter(
        (relativeFile) => relativeFile !== "server/index.ts",
      )) {
        expect(members).not.toContain(omitted);
      }
      expect(members).toContain("server/index.ts");
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});