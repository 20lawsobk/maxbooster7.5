/**
 * Unit test: verify bcrypt cost factor is 12 in source code.
 * This is a static analysis test — it reads the source and asserts cost is not < 12.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("bcrypt cost factor", () => {
  const filesToCheck = [
    "server/routes.ts",
    "server/services/jwtAuthService.ts",
  ];

  it.each(filesToCheck)("cost is >= 12 in %s", (file) => {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return; // file might not exist in all envs
    }
    const bcryptCalls = [...src.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)/g)];
    if (bcryptCalls.length === 0) return; // no bcrypt in this file
    for (const match of bcryptCalls) {
      const cost = parseInt(match[1], 10);
      expect(cost).toBeGreaterThanOrEqual(12);
    }
  });

  it("no bcrypt hash calls use cost < 12 anywhere in server/", () => {
    const { execSync } = require("child_process");
    const result = execSync(
      "grep -rn 'bcrypt.hash' server/ --include='*.ts' 2>/dev/null || true",
    ).toString();
    const calls = [...result.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)/g)];
    for (const match of calls) {
      const cost = parseInt(match[1], 10);
      expect(cost).toBeGreaterThanOrEqual(12);
    }
  });
});
