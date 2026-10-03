import { afterEach, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inventory, sourceIncluded, buildEnvironmentDigest } from "../../script/lib/releaseInventory";
import { spawnSync } from "node:child_process";
import { verifyPreparedRelease, installPreparedRelease } from "../../script/publish-release";

const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prepared-release-test-"));
  fixtures.push(root);
  const write = (relative: string, data = "fixture") => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  write("server/input.ts");
  write("package.json", '{"name":"fixture","type":"module"}');
  write(".dockerignore", ".cache/\n");
  const payloadRoot = path.join(root, ".prepared-release/payload");
  const required = ["start.sh", ".node_bin/node", "dist/pdim-restore.mjs",
    "scripts/boot-stub-server.mjs", "scripts/port-contract.sh",
    ...["node_modules", "python_runtime", "external_maxcore", "external_pdim", "app_remainder"]
      .flatMap(name => [name + ".pdim", name + ".manifest.json"])];
  for (const file of required) write(".prepared-release/payload/" + file);
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), source: await inventory(root, sourceIncluded),
    buildEnvironment: buildEnvironmentDigest(process.env),
    payload: await inventory(payloadRoot),
    verification: { capsules: true, restoredArtifacts: true, runtimeImports: true } };
  write(".prepared-release/release.json", JSON.stringify(manifest));
  return { root, write, manifest };
}

it("accepts an unchanged prepared artifact set without invoking a build", async () => {
  const { root } = await fixture();
  await expect(verifyPreparedRelease(root)).resolves.toHaveProperty("payloadRoot");
});
it("installs only the verified payload into an explicitly disposable fixture", async () => {
  const { root, manifest, write } = await fixture();
  const publisher = fs.readFileSync("script/publish-release.ts", "utf8")
    .replace(/from "(\.\/[^"]+)"/g, (_match, relative) =>
      `from ${JSON.stringify(path.resolve("script", relative.replace(/\.js$/, ".ts")))}`);
  write("script/publish-release.ts", publisher);
  fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  manifest.source = await inventory(root, sourceIncluded);
  write(".prepared-release/release.json", JSON.stringify(manifest));
  const section = fs.readFileSync(".replit", "utf8").match(/^\[deployment\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m)![1];
  const command = JSON.parse(section.match(/^build\s*=\s*(\[[^\n]*\])\s*$/m)![1]);
  const env = { ...process.env };
  for (const key of ["DEPLOY_PACK", "PUBLISH_BUILD_ROOT", "PUBLISH_PAYLOAD_CLEANUP"]) delete env[key];
  const result = spawnSync(command[0], command.slice(1), { cwd: root, env, encoding: "utf8", timeout: 60000 });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("no application build or package installation ran");
  expect(fs.existsSync(path.join(root, "server/input.ts"))).toBe(false);
  expect(await inventory(root)).toEqual(manifest.payload);
}, 60000);
for (const change of ["edit", "add", "remove", "lock"]) {
  it(`rejects ${change} of release inputs`, async () => {
    const { root, write } = await fixture();
    if (change === "edit") write("server/input.ts", "changed");
    if (change === "add") write("server/added.ts");
    if (change === "remove") fs.rmSync(path.join(root, "server/input.ts"));
    if (change === "lock") write("pnpm-lock.yaml", "changed");
    await expect(verifyPreparedRelease(root)).rejects.toThrow(/Production source changed/);
  });
}
it("rejects altered capsules and executable permissions", async () => {
  const { root, write } = await fixture();
  fs.chmodSync(path.join(root, ".prepared-release/payload/start.sh"), 0o700);
  await expect(verifyPreparedRelease(root)).rejects.toThrow(/Prepared artifacts changed/);
  write(".prepared-release/payload/node_modules.pdim", "corrupted");
  await expect(verifyPreparedRelease(root)).rejects.toThrow(/Prepared artifacts changed/);
});
it("binds public frontend build settings without storing their values", () => {
  expect(buildEnvironmentDigest({ VITE_API_ORIGIN: "one" })).not.toBe(buildEnvironmentDigest({ VITE_API_ORIGIN: "two" }));
  expect(buildEnvironmentDigest({ RUNTIME_ONLY: "one" })).toBe(buildEnvironmentDigest({ RUNTIME_ONLY: "two" }));
});
it("never mutates a workspace without explicit disposable-root authorization", async () => {
  const { root } = await fixture();
  await expect(installPreparedRelease(root, {})).rejects.toThrow(/authorization/);
  expect(fs.readFileSync(path.join(root, "server/input.ts"), "utf8")).toBe("fixture");
});
it("rejects missing releases and external source links", async () => {
  const { root } = await fixture();
  fs.rmSync(path.join(root, ".prepared-release"), { recursive: true });
  await expect(verifyPreparedRelease(root)).rejects.toThrow(/No prepared release/);
  fs.symlinkSync("/etc/hosts", path.join(root, "server/external"));
  await expect(inventory(root, sourceIncluded)).rejects.toThrow(/External release input link/);
});