import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DDEXPackageService } from "../ddexPackageService";

let tempDirectory = "";

afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = "";
  }
});

async function validFixture() {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "ddex-package-test-"));
  const audioPath = path.join(tempDirectory, "owner-track.wav");
  const audioBytes = Buffer.from("test-only-audio-payload");
  await writeFile(audioPath, audioBytes);
  return {
    audioPath,
    audioBytes,
    release: {
      id: "release-123",
      title: "Test Release",
      artistName: "Test Artist",
      releaseType: "single" as const,
      upc: "036000291452",
      releaseDate: "2026-11-12",
      labelName: "Test Label",
      copyrightYear: 2026,
      copyrightOwner: "Test Artist",
      primaryGenre: "Pop",
      isExplicit: false,
    },
    tracks: [
      {
        id: "track-123",
        title: "Test Track",
        isrc: "USABC1234567",
        trackNumber: 1,
        duration: 15,
        audioFilePath: audioPath,
        explicit: false,
        primaryArtist: "Test Artist",
        audioCodec: "WAVE",
        sampleRate: 44100,
        channels: 2,
        bitDepth: 16,
      },
    ],
  };
}

describe("DDEXPackageService", () => {
  it("builds relative file references and hashes the actual input file", async () => {
    const service = new DDEXPackageService();
    const fixture = await validFixture();
    const xml = await service.generateDDEXXML(
      fixture.release,
      fixture.tracks,
    );
    const expectedHash = createHash("md5")
      .update(fixture.audioBytes)
      .digest("hex");

    expect(xml).toContain('MessageSchemaVersionId="ern/43"');
    expect(xml).toContain(`>${expectedHash}</HashSum>`);
    expect(xml).toContain("<FileName>track_01.wav</FileName>");
    expect(xml).toContain("<FilePath>track_01.wav</FilePath>");
    expect(xml).not.toContain(fixture.audioPath);
    await expect(service.validateDDEXXML(xml)).resolves.toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects a remote URL and missing source metadata instead of omitting assets", async () => {
    const service = new DDEXPackageService();
    const fixture = await validFixture();
    await expect(
      service.generateDDEXXML(fixture.release, [
        { ...fixture.tracks[0], audioFilePath: "https://example.invalid/song.wav" },
      ]),
    ).rejects.toThrow("must use an owned local audio file");

    const invalidRelease = { ...fixture.release, labelName: "" };
    await expect(
      service.generateDDEXXML(invalidRelease, fixture.tracks),
    ).rejects.toThrow("Missing required release metadata");
  });

  it("rejects invalid identifiers and over-budget media before packaging", async () => {
    const service = new DDEXPackageService();
    const fixture = await validFixture();
    await expect(
      service.generateDDEXXML(
        { ...fixture.release, upc: "036000291453" },
        fixture.tracks,
      ),
    ).rejects.toThrow("valid GS1 check digit");

    await truncate(fixture.audioPath, 200 * 1024 * 1024 + 1);
    await expect(
      service.generateDDEXXML(fixture.release, fixture.tracks),
    ).rejects.toThrow("200 MiB DDEX audio limit");
  });

  it("creates a nonempty ZIP artifact with a ZIP signature", async () => {
    const service = new DDEXPackageService();
    const fixture = await validFixture();
    const outputPath = path.join(tempDirectory, "package.zip");
    await service.createDDEXPackage(
      fixture.release,
      fixture.tracks,
      outputPath,
    );
    const zip = await readFile(outputPath);
    expect(zip.length).toBeGreaterThan(30);
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });
});
