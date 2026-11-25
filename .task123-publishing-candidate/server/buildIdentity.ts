import { execSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

function stableBuildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: "pipe", timeout: 3000 }).toString().trim();
  } catch {
    const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"));
    return crypto.createHash("sha1").update(pkg.version || "1.0.0").digest("hex").slice(0, 8);
  }
}
export const BUILD_ID = process.env.BUILD_ID || stableBuildId();
export const BUILD_TIMESTAMP = new Date().toISOString();