import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  copyProductionSimulationTree,
  REQUIRED_SIMULATION_TEST_PATHS,
  shouldCopyProductionSimulationPath,
} from "../../scripts/lib/production-simulation-copy.mjs";
import {
  assertNoSelectedMaxCoreCandidate,
  MAXCORE_SELECTED_CANDIDATE_POINTER,
} from "../../script/lib/deploymentPreflight.js";

describe("production simulation filtered copy", () => {
  let temporaryRoot = "";

  afterEach(async () => {
    if (temporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
      temporaryRoot = "";
    }
  });

  it("filters sensitive/generated paths before copying and retains runtime source", async () => {
    temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "production-simulation-copy-"),
    );
    const sourceRoot = path.join(temporaryRoot, "source");
    const destinationRoot = path.join(temporaryRoot, "copy");
    await fs.mkdir(sourceRoot);
    await fs.mkdir(destinationRoot);

    const fixtureFiles = new Map<string, string>([
      [".npmrc", "root credential fixture"],
      [".env.production", "root env fixture"],
      [".config/local/credentials.json", "local config fixture"],
      [".agents/memory/MEMORY.md", "workspace memory fixture"],
      [".cloudflared/config.yml", "tunnel config fixture"],
      [".capsule-temp/partial.pdim", "temporary capsule fixture"],
      [".github/workflows/deploy.yml", "workspace workflow fixture"],
      [".pythonlibs/lib/python3.12/site-packages/large-cache", "local Python cache"],
      ["venv/bin/python", "workspace interpreter fixture"],
      ["venv/pyvenv.cfg", "workspace environment fixture"],
      ["ai_model/weights/model.pt", "legacy workspace model fixture"],
      ["boosterstate-data/state.bin", "runtime data fixture"],
      ["tests/unit/example.test.ts", "test fixture"],
      ...REQUIRED_SIMULATION_TEST_PATHS.map(
        (relativePath) =>
          [relativePath, "required simulation test fixture"] as [string, string],
      ),
      ["docs/deployment.md", "documentation fixture"],
      ["python_runtime/bin/python3.12", "pinned runtime fixture"],
      [
        "python_runtime/lib/python3.12/site-packages/pip/_vendor/certifi/cacert.pem",
        "runtime CA fixture",
      ],
      ["client/public/videos/sample.mp4", "prebuilt video fixture"],
      ["dist/public/assets/app.js.br", "compressed asset fixture"],
      ["dns-node/keys/private.pem", "private key fixture"],
      ["public/generated-content/item.json", "generated content fixture"],
      ["external/maxcore/.npmrc", "nested credential fixture"],
      ["external/maxcore/nested/.npmrc", "nested package fixture"],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/training_data/pull.json",
        "pulled training fixture",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_runs/run-1/candidate.pt",
        "candidate fixture",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_registry/selected.json",
        "selection fixture",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt",
        "model fixture admitted later by release validation",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
        "source model fixture admitted explicitly",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/training/trainer.py",
        "training source fixture",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/training/combined_training_data.json",
        "named corpus fixture",
      ],
      [
        "external/maxcore/artifacts/ai-training-server/ai_model/__pycache__/trainer.pyc",
        "bytecode fixture",
      ],
      ["external/pdim/.npmrc", "PDIM credential fixture"],
      ["external/pdim/src/index.py", "PDIM source fixture"],
      ["external/pdim/venv/lib/site-packages/nested-dependency.py", "nested dependency environment fixture"],
      ["node_modules/example/.npmrc", "dependency package fixture"],
      ["server/index.ts", "application source fixture"],
    ]);

    for (const [relativeFile, contents] of fixtureFiles) {
      const absoluteFile = path.join(sourceRoot, relativeFile);
      await fs.mkdir(path.dirname(absoluteFile), { recursive: true });
      await fs.writeFile(absoluteFile, contents);
    }
    const outsideInterpreter = path.join(temporaryRoot, "external-wrapper", "python-wrapped");
    await fs.mkdir(path.dirname(outsideInterpreter), { recursive: true });
    await fs.writeFile(outsideInterpreter, "unchanged external interpreter fixture");
    await fs.symlink(
      "python-wrapped",
      path.join(temporaryRoot, "external-wrapper", ".python-wrapped"),
    );
    const workspaceWrapper = path.join(sourceRoot, "venv", "bin", ".python-wrapped");
    await fs.mkdir(path.dirname(workspaceWrapper), { recursive: true });
    await fs.symlink(
      path.relative(path.dirname(workspaceWrapper), path.join(temporaryRoot, "external-wrapper", ".python-wrapped")),
      workspaceWrapper,
    );
    const wrapperTargetBefore = await fs.readlink(workspaceWrapper);
    const externalInterpreterBefore = await fs.readFile(outsideInterpreter);
    await fs.chmod(path.join(sourceRoot, "server/index.ts"), 0o640);
    await fs.symlink(
      "index.ts",
      path.join(sourceRoot, "server/current.ts"),
    );

    const copyCounts = copyProductionSimulationTree(
      sourceRoot,
      destinationRoot,
    );
    expect(copyCounts.files).toBeGreaterThan(0);
    expect(() => assertNoSelectedMaxCoreCandidate(destinationRoot)).toThrow(
      /candidate-only artifacts that are excluded/,
    );

    for (const omitted of [
      ".npmrc",
      ".env.production",
      ".cloudflared/config.yml",
      "dns-node/keys/private.pem",
      ".config/local/credentials.json",
      ".agents/memory/MEMORY.md",
      ".capsule-temp/partial.pdim",
      ".github/workflows/deploy.yml",
      ".pythonlibs/lib/python3.12/site-packages/large-cache",
      "ai_model/weights/model.pt",
      "boosterstate-data/state.bin",
      "tests/unit/example.test.ts",
      "docs/deployment.md",
      "venv/bin/python",
      "venv/pyvenv.cfg",
      "client/public/videos/sample.mp4",
      "dist/public/assets/app.js.br",
      "public/generated-content/item.json",
      "external/maxcore/.npmrc",
      "external/maxcore/artifacts/ai-training-server/ai_model/training_data/pull.json",
      "external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_runs/run-1/candidate.pt",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt",
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
      "external/maxcore/artifacts/ai-training-server/ai_model/__pycache__/trainer.pyc",
      "external/pdim/.npmrc",
    ]) {
      await expect(fs.access(path.join(destinationRoot, omitted))).rejects.toThrow();
    }

    for (const retained of [
      "external/maxcore/artifacts/ai-training-server/ai_model/training/trainer.py",
      "external/maxcore/artifacts/ai-training-server/training/combined_training_data.json",
      "external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_registry/selected.json",
      "external/pdim/src/index.py",
      "external/pdim/venv/lib/site-packages/nested-dependency.py",
      "external/maxcore/nested/.npmrc",
      "node_modules/example/.npmrc",
      ...REQUIRED_SIMULATION_TEST_PATHS,
      "python_runtime/bin/python3.12",
      "python_runtime/lib/python3.12/site-packages/pip/_vendor/certifi/cacert.pem",
      "server/index.ts",
    ]) {
      await expect(fs.access(path.join(destinationRoot, retained))).resolves.toBeUndefined();
    }
    expect(
      (await fs.stat(path.join(destinationRoot, "server/index.ts"))).mode & 0o777,
    ).toBe(0o640);
    expect(
      await fs.readlink(path.join(destinationRoot, "server/current.ts")),
    ).toBe("index.ts");
    await expect(fs.access(path.join(destinationRoot, "venv"))).rejects.toThrow();
    expect(await fs.readlink(workspaceWrapper)).toBe(wrapperTargetBefore);
    expect(await fs.readFile(outsideInterpreter)).toEqual(externalInterpreterBefore);
    expect(shouldCopyProductionSimulationPath("venv/bin/python")).toBe(false);
    expect(shouldCopyProductionSimulationPath("external/pdim/venv/lib/site-packages/nested-dependency.py")).toBe(true);

    expect(shouldCopyProductionSimulationPath("node_modules/example/.npmrc")).toBe(
      true,
    );
    expect(shouldCopyProductionSimulationPath(".cloudflared/config.yml")).toBe(
      false,
    );
  });
});

describe("production deployment candidate preflight", () => {
  it("refuses a candidate-only selection whose run artifacts are excluded", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "deployment-candidate-preflight-"),
    );
    try {
      expect(() => assertNoSelectedMaxCoreCandidate(temporaryRoot)).not.toThrow();
      const pointer = path.join(temporaryRoot, MAXCORE_SELECTED_CANDIDATE_POINTER);
      await fs.mkdir(path.dirname(pointer), { recursive: true });
      await fs.writeFile(pointer, "fixture selection");
      expect(() => assertNoSelectedMaxCoreCandidate(temporaryRoot)).toThrow(
        /candidate-only artifacts that are excluded/,
      );
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});