import { describe, expect, it } from "vitest";
import { validateGeneratedArtifact } from "../generatedArtifactValidation.js";

function wav() {
  const b = Buffer.alloc(16044);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(16000, 40);
  return b;
}

describe("actual generated artifact validation", () => {
  it("probes encoded duration rather than a render specification", async () => {
    expect(await validateGeneratedArtifact(wav(), "audio")).toMatchObject({ duration: 1, sample_rate: 8000 });
  });
  it("rejects specifications and wrong media kinds", async () => {
    await expect(validateGeneratedArtifact(Buffer.from(JSON.stringify({ duration: 99, url: "/fake.wav" })), "audio")).rejects.toThrow();
    await expect(validateGeneratedArtifact(wav(), "video")).rejects.toThrow("required media stream");
  });
});