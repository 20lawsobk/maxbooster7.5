#!/usr/bin/env node
// db-push.js — applies schema changes via drizzle-kit push
import { execSync } from "child_process";

const force = process.argv.includes("--force");
const cmd = force ? "npx drizzle-kit push --force" : "npx drizzle-kit push";

try {
  execSync(cmd, { stdio: "inherit" });
} catch (err) {
  process.exit(err.status ?? 1);
}
