import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256DistributionFile } from "../distributionFileDigest";

let tempDirectory = "";

afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = "";
  }
});

describe("sha256DistributionFile", () => {
  it("streams the exact file bytes and reports their byte length", async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "distribution-digest-"));
    const audioBytes = Buffer.from("owner-upload-audio-fixture");
    const filePath = path.join(tempDirectory, "audio.bin");
    await writeFile(filePath, audioBytes);

    await expect(sha256DistributionFile(filePath)).resolves.toEqual({
      sha256: createHash("sha256").update(audioBytes).digest("hex"),
      byteLength: audioBytes.length,
    });
  });

  it("rejects empty files instead of generating a success-shaped digest", async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "distribution-digest-"));
    const filePath = path.join(tempDirectory, "empty.wav");
    await writeFile(filePath, "");

    await expect(sha256DistributionFile(filePath)).rejects.toThrow(
      "Audio asset is empty or is not a regular file",
    );
  });
});
