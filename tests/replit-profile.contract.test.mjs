import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = p => readFileSync(resolve(process.cwd(), p), "utf8");
const template = file(".replit.example");
const nix = file("replit.nix");
const gitignore = file(".gitignore");
const pkg = JSON.parse(file("package.json"));

function portBlocks(config) {
  return config.split(/^\s*\[\[ports\]\]\s*$/m).slice(1).map(block => ({
    localPort: Number(block.match(/^\s*localPort\s*=\s*(\d+)/m)?.[1]),
    externalPort: block.match(/^\s*externalPort\s*=\s*(\d+)/m)?.[1],
  }));
}

test("Replit configuration and template contain no inline credentials", () => {
  assert.doesNotMatch(gitignore, /^\.replit$/m);
  assert.equal(file(".replit"), template.split("\n").slice(1).join("\n"));
  assert.doesNotMatch(template, /^\s*\[userenv(?:\.|\])/m);
  assert.doesNotMatch(template, /^\s*(?:DATABASE_URL|OPENAI_API_KEY|STRIPE_SECRET_KEY|SESSION_SECRET)\s*=/m);
});

test("public mapping is exactly app 5000 -> external 80", () => {
  const mappings = portBlocks(template);
  assert.deepEqual(mappings, [{ localPort: 5000, externalPort: "80" }]);
  assert.match(file("scripts/port-contract.sh"), /PORT="\$\{PORT:-5000\}"/);
});

test("deployment runs the capsule-aware build and production launcher", () => {
  assert.match(template, /build\s*=\s*\["bash",\s*"build\.sh"\]/);
  assert.match(template, /run\s*=\s*\["bash",\s*"start\.sh"\]/);
  assert.equal(pkg.scripts.build, "node scripts/build-production.mjs");
  assert.equal(pkg.scripts.dev, "bash scripts/start-dev.sh");
  assert.match(file("start.sh"), /port-contract/);
});

test("Nix profile retains the lightweight required system dependencies", () => {
  const deps = new Set([...nix.matchAll(/pkgs\.([a-zA-Z0-9_]+)/g)].map(m => m[1]));
  for (const name of ["postgresql_17", "xz", "zstd", "libarchive", "psmisc", "redis", "dejavu_fonts", "ffmpeg"]) {
    assert.ok(deps.has(name), `replit.nix is missing ${name}`);
  }
  assert.ok(!deps.has("cudaPackages"), "avoid persistent heavy CUDA closure");
});

test("Node release is pinned to major 22", () => {
  assert.equal(file(".nvmrc").trim(), "22");
  assert.equal(file(".node-version").trim(), "22");
});
