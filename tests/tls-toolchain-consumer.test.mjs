import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(new URL("../tls-proxy/package.json", import.meta.url));

test("TLS development consumer uses matching patched esbuild library and native binary", () => {
  const tsxRequire = createRequire(require.resolve("tsx/cli"));
  const esbuild = tsxRequire("esbuild");
  const esbuildRequire = createRequire(tsxRequire.resolve("esbuild"));
  assert.equal(esbuild.version, "0.28.2");
  assert.equal(esbuildRequire("@esbuild/linux-x64/package.json").version, esbuild.version);
  const result = esbuild.transformSync("const value: number = 42;", { loader: "ts" });
  assert.match(result.code, /const value = 42/);
});

test("actual TLS tsx command transpiles and executes an isolated TypeScript fixture", () => {
  const output = execFileSync(process.execPath, [
    require.resolve("tsx/cli"), "--eval",
    "const sum = (a: number, b: number): number => a + b; console.log(sum(20, 22));",
  ], { encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } });
  assert.equal(output.trim(), "42");
});