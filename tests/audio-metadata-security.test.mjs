import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBuffer } from "music-metadata";
import fs from "node:fs";

test("audio parser lock resolves reproducibly from the public registry", () => {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const parser = lock.packages["node_modules/music-metadata"];
  assert.equal(new URL(parser.resolved).hostname, "registry.npmjs.org");
  assert.ok(parser.integrity.startsWith("sha512-"));
});

test("audio metadata retains valid WAV parsing", async () => {
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0); wav.writeUInt32LE(40, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(4, 40);
  const metadata = await parseBuffer(wav, { mimeType: "audio/wav" });
  assert.equal(metadata.format.sampleRate, 44100);
  assert.equal(metadata.format.numberOfChannels, 1);
});

test("truncated ID3 length cannot allocate its claimed 256 MiB payload", async () => {
  const malformed = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f]);
  const before = process.memoryUsage().arrayBuffers;
  // The parser may return warnings or reject truncated input; either behavior
  // must avoid allocating the untrusted declared length before checking bounds.
  try {
    await parseBuffer(malformed, { mimeType: "audio/mpeg" });
  } catch (error) {
    assert.ok(error instanceof Error);
  }
  assert.ok(process.memoryUsage().arrayBuffers - before < 8 * 1024 * 1024);
});
