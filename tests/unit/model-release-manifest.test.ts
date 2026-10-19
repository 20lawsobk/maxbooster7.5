import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MODEL_RELEASE_MANIFEST,
  validateModelRelease,
} from "../../script/lib/modelRelease.js";

describe("model release manifest", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture(content = Buffer.from("validated model bytes")) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-release-"));
    roots.push(root);
    const modelRelative =
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt";
    const sourceRelative =
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
    const modelPath = path.join(root, modelRelative);
    const sourcePath = path.join(root, sourceRelative);
    const manifestPath = path.join(root, MODEL_RELEASE_MANIFEST);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const lfsPointer = Buffer.from(
      `version https://git-lfs.github.com/spec/v1\n` +
        `oid sha256:${sha256}\n` +
        `size ${content.length}\n`,
    );
    const sourceGitBlob = createHash("sha1")
      .update(`blob ${lfsPointer.length}\0`)
      .update(lfsPointer)
      .digest("hex");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, content);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        sourcePath: sourceRelative,
        sourceGitBlob,
        path: modelRelative,
        bytes: content.length,
        sha256,
        capability: "numerical-inference",
        qualityClaim: "not-evaluated",
      }),
    );
    return { root, modelPath };
  }

  it("materializes and binds the active checkpoint path, size, and SHA-256", () => {
    const { root, modelPath } = fixture();
    expect(validateModelRelease(root)).toEqual({
      path: "artifacts/ai-training-server/ai_model/weights/model.pt",
      bytes: 21,
      sha256: "efb1284431c15ffa97bdae51c605e353cc0ff4f17e345faf106fc6e4e6e8da46",
    });
    expect(fs.readFileSync(modelPath, "utf8")).toBe("validated model bytes");
  });

  it("uses an existing checksum-verified checkpoint without fetching an LFS source", () => {
    const { root, modelPath } = fixture();
    validateModelRelease(root);
    const source = path.join(
      root,
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
    );
    fs.rmSync(source);
    expect(validateModelRelease(root, { readOnly: true }).sha256).toBe(
      createHash("sha256").update("validated model bytes").digest("hex"),
    );
  });

  it("accepts an unmaterialized LFS pointer only when model.pt is valid", () => {
    const { root, modelPath } = fixture();
    const source = path.join(
      root,
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
    );
    const valid = fs.readFileSync(source);
    const pointer = Buffer.from(
      `version https://git-lfs.github.com/spec/v1\n` +
        `oid sha256:${createHash("sha256").update(valid).digest("hex")}\n` +
        `size ${valid.length}\n`,
    );
    fs.writeFileSync(source, pointer);
    expect(() => validateModelRelease(root)).toThrow(/model checkpoint not available/);
    fs.writeFileSync(modelPath, valid);
    expect(validateModelRelease(root, { readOnly: true }).bytes).toBe(valid.length);
    fs.appendFileSync(modelPath, "tampered");
    expect(() => validateModelRelease(root, { readOnly: true })).toThrow(/size mismatch/);
  });

  it("fails closed if neither source nor active model is available", () => {
    const { root } = fixture();
    fs.rmSync(path.join(
      root,
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt",
    ));
    expect(() => validateModelRelease(root)).toThrow(/checkpoint not available/);
  });

  it("fails closed when checkpoint bytes differ", () => {
    const { root } = fixture();
    validateModelRelease(root);
    const modelPath = path.join(
      root,
      "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt",
    );
    fs.appendFileSync(modelPath, "changed");
    expect(() => validateModelRelease(root)).toThrow(/size mismatch/);
  });
});