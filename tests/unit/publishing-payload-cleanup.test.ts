import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublishingCleanupExpectation,
  cleanPublishingPayload,
  isDisposablePublishingCopy,
  measurePublishingPayload,
  PROTECTED_PUBLISHING_PATHS,
} from "../../script/lib/publishingPayload.js";
import { RECOVERY_HELPER_PATH } from "../../script/lib/deploymentPackRecovery.mjs";

// Every deletion in this suite is confined to mkdtemp fixtures, never the app.
const fixtures: string[] = [];
const publishing = { DEPLOY_PACK: "1", REPLIT_DEPLOYMENT: "1" };
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fs.rmSync(fixture, { recursive: true, force: true });
});

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-payload-test-"));
  fixtures.push(base);
  const root = path.join(base, "publishing-copy");
  fs.mkdirSync(root);
  function write(relative: string, content = `fixture ${relative}\n`) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
    return absolute;
  }
  return { base, root, write };
}

describe("disposable publishing payload cleanup", () => {
  for (const env of [
    {}, { DEPLOY_PACK: "1" }, { REPLIT_DEPLOYMENT: "1" },
    { DEPLOY_PACK: "0", REPLIT_DEPLOYMENT: "1" },
    { DEPLOY_PACK: "1", REPLIT_DEPLOYMENT: "0" },
    { DEPLOY_PACK: "1", REPLIT_DEPLOYMENT_ID: "   " },
    { DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1" },
  ]) {
    it(`refuses any deletion without both authorization conditions (${JSON.stringify(env)})`, () => {
      const { root, write } = fixture();
      const archived = write(".local/preserved-simulation/evidence", "preserved bytes");
      expect(isDisposablePublishingCopy(env)).toBe(false);
      expect(() => cleanPublishingPayload({
        root, env, dockerignore: ".local/\n", requiredPaths: [],
      })).toThrow(/requires DEPLOY_PACK=1 AND/);
      expect(fs.readFileSync(archived, "utf8")).toBe("preserved bytes");
    });
  }

  it("fails the explicit publishing expectation before local builds, but permits simulations without it", () => {
    expect(() => assertPublishingCleanupExpectation({
      DEPLOY_PACK: "1", PUBLISH_PAYLOAD_CLEANUP: "1",
    })).toThrow(/no recovery\/build mutations/);
    expect(() => assertPublishingCleanupExpectation({
      REPLIT_DEPLOYMENT: "1", PUBLISH_PAYLOAD_CLEANUP: "1",
    })).toThrow(/requires DEPLOY_PACK/);
    expect(() => assertPublishingCleanupExpectation({ DEPLOY_PACK: "1" })).not.toThrow();
    expect(() => assertPublishingCleanupExpectation({
      ...publishing, PUBLISH_PAYLOAD_CLEANUP: "1",
    })).not.toThrow();
    expect(isDisposablePublishingCopy({ DEPLOY_PACK: "1", REPLIT_DEPLOYMENT_ID: "fixture-id" })).toBe(true);
  });

  it("physically removes ignored roots and dangling links without touching their targets or outside state", () => {
    const { base, root, write } = fixture();
    const outside = path.join(base, "preserved-source-and-recovery");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "journal.json"), "outside recovery evidence");
    write(".local/archived-simulation/output", "only the disposable copy");
    write(".config/pulse/repl-runtime", "ignored runtime state");
    write(".git/objects/fixture", "fixture git object");
    write("untracked-output.bin", "real untracked output");
    fs.symlinkSync(outside, path.join(root, "excluded-source-link"));
    fs.symlinkSync(path.join(outside, "missing"), path.join(root, "excluded-dangling-link"));
    const result = cleanPublishingPayload({
      root, env: publishing,
      dockerignore: ".local/\n.config/\n.git\nexcluded-*\n", requiredPaths: [],
    });
    expect(result.removedPaths).toEqual([
      ".config", ".git", ".local", "excluded-dangling-link", "excluded-source-link",
    ]);
    expect(fs.readdirSync(root)).toEqual(["untracked-output.bin"]);
    expect(fs.readFileSync(path.join(outside, "journal.json"), "utf8")).toBe("outside recovery evidence");
    expect(fs.existsSync(path.join(outside, "missing"))).toBe(false);
  });

  it("preserves every bootstrap, recovery helper, capsule, manifest and dependency-control byte", () => {
    const { root, write } = fixture();
    const original = new Map<string, Buffer>();
    for (const relative of PROTECTED_PUBLISHING_PATHS) {
      // .node_bin is a directory, not a regular file.
      if (relative === ".node_bin") continue;
      write(relative);
      original.set(relative, fs.readFileSync(path.join(root, relative)));
    }
    write(".node_bin/node", "bootstrap executable fixture");
    write(".config/ignored");
    write("scripts/ignored-development-helper");
    const required = ["start.sh", ".node_bin/node", RECOVERY_HELPER_PATH, "app_remainder.pdim", "app_remainder.manifest.json"];
    cleanPublishingPayload({
      root, env: publishing,
      dockerignore: ".config/\nscripts/*\n!scripts/boot-stub-server.mjs\n!scripts/port-contract.sh\n!scripts/check-port-contract.ts\n",
      requiredPaths: required,
    });
    for (const [relative, bytes] of original) {
      expect(fs.readFileSync(path.join(root, relative)), relative).toEqual(bytes);
    }
    expect(fs.readFileSync(path.join(root, ".node_bin/node"), "utf8")).toBe("bootstrap executable fixture");
  });

  it("the real publishing policy removes archived audio links while retaining the complete bootstrap set", () => {
    const { root, write } = fixture();
    for (const relative of PROTECTED_PUBLISHING_PATHS) {
      if (relative !== ".node_bin") write(relative);
    }
    write(".node_bin/node");
    write(".local/production-simulation/runs/archive/app/.config/pulse/evidence");
    fs.symlinkSync("/tmp/nonexistent-pulse-fixture",
      path.join(root, ".local/production-simulation/runs/archive/app/.config/pulse/repl-runtime"));
    write(".config/pulse/evidence");
    const required = PROTECTED_PUBLISHING_PATHS.filter(p => p !== ".node_bin").concat(".node_bin/node");
    const result = cleanPublishingPayload({
      root, env: publishing, dockerignore: fs.readFileSync(".dockerignore", "utf8"),
      requiredPaths: required,
    });
    expect(result.removedPaths).toContain(".local");
    expect(result.removedPaths).toContain(".config");
    for (const file of required) expect(fs.existsSync(path.join(root, file)), file).toBe(true);
  });

  for (const conflictingPattern of ["start.sh", "script/", "*.pdim", "*.manifest.json", "pyproject.toml", ".node_bin/"]) {
    it(`fails before any deletion when policy excludes a protected runtime path (${conflictingPattern})`, () => {
      const { root, write } = fixture();
      write("start.sh");
      write(RECOVERY_HELPER_PATH);
      write("app_remainder.pdim");
      write("app_remainder.manifest.json");
      write("pyproject.toml");
      write(".node_bin/node");
      const archived = write(".local/archived/evidence");
      expect(() => cleanPublishingPayload({
        root, env: publishing, dockerignore: `.local/\n${conflictingPattern}\n`, requiredPaths: [],
      })).toThrow(/conflicts with protected/);
      expect(fs.existsSync(archived)).toBe(true);
    });
  }

  it("requires the bootstrap paths before deleting excluded data", () => {
    const { root, write } = fixture();
    const archived = write(".local/evidence");
    expect(() => cleanPublishingPayload({
      root, env: publishing, dockerignore: ".local/\n", requiredPaths: ["start.sh"],
    })).toThrow(/Required publishing runtime path is missing/);
    expect(fs.existsSync(archived)).toBe(true);
  });

  for (const kind of ["broken", "external", "excluded", "cycle"]) {
    it(`fails closed before deletion on a surviving ${kind} symlink`, () => {
      const { base, root, write } = fixture();
      const archived = write(".local/evidence");
      const outside = path.join(base, "outside");
      fs.writeFileSync(outside, "untouched outside bytes");
      const target = kind === "broken" ? "missing" : kind === "external"
        ? outside : kind === "excluded" ? ".local/evidence" : "surviving-link";
      fs.symlinkSync(target, path.join(root, "surviving-link"));
      expect(() => cleanPublishingPayload({
        root, env: publishing, dockerignore: ".local/\n", requiredPaths: [],
      })).toThrow(/publishing payload symlink/i);
      expect(fs.existsSync(archived)).toBe(true);
      expect(fs.readFileSync(outside, "utf8")).toBe("untouched outside bytes");
    });
  }

  it("measures all real nonignored entries including untracked output, counting safe links only once", () => {
    const { root, write } = fixture();
    write("untracked.bin", "untracked payload bytes");
    write("dist/output.mjs", "built output bytes");
    write(".local/ignored", "not uploaded bytes");
    fs.symlinkSync("untracked.bin", path.join(root, "safe-link"));
    const expected = ["", "untracked.bin", "dist", "dist/output.mjs", "safe-link"]
      .reduce((sum, relative) => sum + fs.lstatSync(path.join(root, relative)).size, 0);
    const measurement = measurePublishingPayload(root, ".local/\n");
    expect(measurement.totalBytes).toBe(expected);
    expect(measurement.entries).toBe(4);
    expect(measurement.byTopDir.get("dist")).toBe(
      fs.lstatSync(path.join(root, "dist")).size + Buffer.byteLength("built output bytes"),
    );
    expect(fs.existsSync(path.join(root, ".local/ignored"))).toBe(true);
  });

  it("refuses an in-tree undo journal but allows an empty legacy parent directory", () => {
    const { root, write } = fixture();
    write(".deployment-pack-state/transaction/journal.json", "fixture undo journal");
    write(".local/evidence");
    const options = {
      root, env: publishing, dockerignore: ".deployment-pack-state/\n.local/\n", requiredPaths: [],
    };
    expect(() => cleanPublishingPayload(options)).toThrow(/recovery state must be outside/);
    expect(fs.existsSync(path.join(root, ".local/evidence"))).toBe(true);
    fs.rmSync(path.join(root, ".deployment-pack-state/transaction"), { recursive: true });
    cleanPublishingPayload(options);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("rejects a symlinked root without changing the real tree", () => {
    const { base, root, write } = fixture();
    const evidence = write(".local/evidence");
    const linkedRoot = path.join(base, "linked-root");
    fs.symlinkSync(root, linkedRoot);
    expect(() => cleanPublishingPayload({
      root: linkedRoot, env: publishing, dockerignore: ".local/\n", requiredPaths: [],
    })).toThrow(/root must be a real directory/);
    expect(fs.existsSync(evidence)).toBe(true);
  });
});