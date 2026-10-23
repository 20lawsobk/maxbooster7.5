import { afterEach, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inventory, sourceIncluded, buildEnvironmentDigest } from "../../script/lib/releaseInventory";
import { DEPLOYMENT_BOOTSTRAP_FILES } from "../../script/lib/deploymentControlFiles";
import { treeIdentity } from "../../script/lib/preparedCapsules";
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
  const required = [...DEPLOYMENT_BOOTSTRAP_FILES, "start.sh", ".node_bin/node", "dist/pdim-restore.mjs",
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

function fixtureNixMeasurement(root: string, available: boolean): NodeJS.ProcessEnv {
  const bin = path.join(root, ".fixture-bin");
  fs.mkdirSync(bin, { recursive: true });
  const du = path.join(bin, "du");
  const validateArgs = [
    '[ "$#" -eq 6 ]',
    '[ "$1" = "-s" ]',
    '[ "$2" = "--apparent-size" ]',
    '[ "$3" = "--count-links" ]',
    '[ "$4" = "--block-size=1" ]',
    '[ "$5" = "--" ]',
    '[ "$6" = "/nix/store" ]',
  ].join(" && ");
  const result = available
    ? "printf '1\\t/nix/store\\n'"
    : "printf 'fixture Nix-store measurement unavailable\\n' >&2\nexit 1";
  fs.writeFileSync(
    du,
    `#!/bin/sh\nif ! ( ${validateArgs} ); then echo 'unexpected du arguments' >&2; exit 2; fi\n${result}\n`,
    { mode: 0o755 },
  );
  return {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
  };
}

it("accepts an unchanged prepared artifact set without invoking a build", async () => {
  const { root } = await fixture();
  await expect(verifyPreparedRelease(root)).resolves.toHaveProperty("payloadRoot");
});
it("installs only the verified payload into an explicitly disposable fixture", async () => {
  const { root, manifest, write } = await fixture();
  write(".cache/replit/platform-cache", "platform-owned cache");
  const authorization = {
    DEPLOY_PACK: "1",
    PUBLISH_PAYLOAD_CLEANUP: "1",
    PUBLISH_BUILD_ROOT: root,
  };
  // Keep the production image-budget checks, but supply a deterministic fully
  // covered Nix measurement so this installer test does not depend on the
  // developer host's unrelated compiler and browser packages.
  await installPreparedRelease(root, authorization, () => ({
    roots: ["/nix/store/fixture-runtime"],
    coveredRoots: ["/nix/store/fixture-runtime"],
    totalBytes: 1024,
  }));
  expect(fs.existsSync(path.join(root, "server/input.ts"))).toBe(false);
  expect(fs.readFileSync(path.join(root, ".cache/replit/platform-cache"), "utf8"))
    .toBe("platform-owned cache");
  expect(await inventory(root, relative =>
    relative !== ".cache" && !relative.startsWith(".cache/"))).toEqual(manifest.payload);
}, 60000);

it("publishes the verified payload into a disposable copy without building", async () => {
  const { root, manifest, write } = await fixture();
  const publisher = fs.readFileSync("script/publish-release.ts", "utf8")
    .replace(/from "(\.\/[^"]+)"/g, (_match, relative) =>
      `from ${JSON.stringify(path.resolve("script", relative.replace(/\.js$/, ".ts")))}`);
  write("script/publish-release.ts", publisher);
  fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  const env = fixtureNixMeasurement(root, true);
  manifest.source = await inventory(root, sourceIncluded);
  write(".prepared-release/release.json", JSON.stringify(manifest));
  const command = [process.execPath, "--import", "tsx", "script/publish-release.ts", "--publish-disposable-copy", root];
  for (const key of ["DEPLOY_PACK", "PUBLISH_BUILD_ROOT", "PUBLISH_PAYLOAD_CLEANUP"]) delete env[key];
  const result = spawnSync(command[0], command.slice(1), { cwd: root, env, encoding: "utf8", timeout: 60000 });
  expect(result.status, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("no application build or package installation ran");
}, 60000);

it("refuses oversized and incompletely measured Nix stores before fixture mutation", async () => {
  for (const nix of [
    { roots: ["/nix/store/unmeasured"], coveredRoots: [], totalBytes: 0 },
    { roots: ["/nix/store/oversized"], coveredRoots: ["/nix/store/oversized"], totalBytes: 8 * 1024 ** 3 },
  ]) {
    const { root } = await fixture();
    const authorization = {
      DEPLOY_PACK: "1",
      PUBLISH_PAYLOAD_CLEANUP: "1",
      PUBLISH_BUILD_ROOT: root,
    };
    const before = await inventory(root);
    await expect(installPreparedRelease(root, authorization, () => nix))
      .rejects.toThrow(/exceeds image budget or has unmeasured Nix roots/);
    expect(await inventory(root)).toEqual(before);
  }
});

it("fails closed before deleting the disposable source when Nix size is unknown", async () => {
  const { root, manifest, write } = await fixture();
  const publisher = fs.readFileSync("script/publish-release.ts", "utf8")
    .replace(/from "(\.\/[^"]+)"/g, (_match, relative) =>
      `from ${JSON.stringify(path.resolve("script", relative.replace(/\.js$/, ".ts")))}`);
  write("script/publish-release.ts", publisher);
  fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  const env = fixtureNixMeasurement(root, false);
  manifest.source = await inventory(root, sourceIncluded);
  write(".prepared-release/release.json", JSON.stringify(manifest));
  const command = [process.execPath, "--import", "tsx", "script/publish-release.ts", "--publish-disposable-copy", root];
  for (const key of ["DEPLOY_PACK", "PUBLISH_BUILD_ROOT", "PUBLISH_PAYLOAD_CLEANUP"]) delete env[key];
  const result = spawnSync(command[0], command.slice(1), { cwd: root, env, encoding: "utf8", timeout: 60000 });
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain("Cannot measure the publishing Nix store");
  expect(fs.readFileSync(path.join(root, "server/input.ts"), "utf8")).toBe("fixture");
  expect(fs.existsSync(path.join(root, ".prepared-release/payload"))).toBe(true);
}, 60000);

for (const change of ["edit", "add", "remove", "lock", "port mapping"]) {
  it(`rejects ${change} of release inputs`, async () => {
    const { root, write } = await fixture();
    if (change === "edit") write("server/input.ts", "changed");
    if (change === "add") write("server/added.ts");
    if (change === "remove") fs.rmSync(path.join(root, "server/input.ts"));
    if (change === "lock") write("pnpm-lock.yaml", "changed");
    if (change === "port mapping") write(".replit", "[[ports]]\nlocalPort=5001\nexternalPort=80");
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
it("capsule identity ignores excluded transient caches and still detects admitted input changes", async () => {
  const { root, write } = await fixture();
  write("external/maxcore/lib/pkg/node_modules/.cache/jiti/cache.mjs", "first");
  write("external/maxcore/lib/pkg/index.ts", "first");
  const excluded = ["**/node_modules/.cache"];
  const before = await treeIdentity(root, "external/maxcore", excluded);
  write("external/maxcore/lib/pkg/node_modules/.cache/jiti/cache.mjs", "changed");
  expect(await treeIdentity(root, "external/maxcore", excluded)).toBe(before);
  write("external/maxcore/lib/pkg/index.ts", "changed");
  expect(await treeIdentity(root, "external/maxcore", excluded)).not.toBe(before);
});

it("does not invalidate or ship a prepared release for generated JUnit output", async () => {
  const { root, write } = await fixture();
  write("test-results.xml", "<testsuites tests='1'/>");
  await expect(verifyPreparedRelease(root)).resolves.toHaveProperty("payloadRoot");
});

it("rejects a self-consistent release that omits the pre-extraction bootstrap", async () => {
  const { root, manifest, write } = await fixture();
  fs.rmSync(path.join(root, ".prepared-release/payload/dist/deployment/executive.mjs"));
  manifest.payload = await inventory(path.join(root, ".prepared-release/payload"));
  write(".prepared-release/release.json", JSON.stringify(manifest));
  await expect(verifyPreparedRelease(root)).rejects.toThrow(/Required prepared artifact missing: dist\/deployment\/executive/);
});
