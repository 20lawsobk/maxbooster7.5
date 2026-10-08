import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { floors } from "../scripts/verify-runtime-artifacts.mjs";
import { mediaTranscoder } from "../server/pocket-dimension/fabric/compression/MediaTranscoder.ts";

function atLeast(version, minimum) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const a = version.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  return a[0] > b[0] || (a[0] === b[0] &&
    (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
}

test("GHSA-wq5f-xc86-pv6w: manifest, lock, gate and every Sharp consumer require patched binaries", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(manifest.dependencies.sharp, lock.packages[""].dependencies.sharp);
  assert.ok(atLeast(manifest.dependencies.sharp.replace(/^\^/, ""), "0.35.5"));
  assert.ok(atLeast(floors.sharp, "0.35.5"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name.endsWith("/sharp")) assert.ok(atLeast(entry.version, "0.35.5"), name);
    if (name.includes("/@img/sharp-libvips-")) assert.ok(atLeast(entry.version, "1.3.4"), name);
    else if (name.includes("/@img/sharp-")) assert.ok(atLeast(entry.version, "0.35.5"), name);
  }
  const consumers = [
    "server/image-generation.ts",
    "server/services/autonomousService.ts",
    "server/services/dspPolicyChecker.ts",
    "server/services/imageProcessor.ts",
    "server/services/sharpImageService.ts",
    "server/pocket-dimension/fabric/compression/MediaTranscoder.ts",
  ];
  for (const file of consumers) {
    const require = createRequire(path.resolve(file));
    const actual = require("sharp");
    assert.ok(atLeast(actual.versions.sharp, "0.35.5"), file);
    // The native runtime version matters: a newer JS wrapper alone is not enough.
    assert.ok(atLeast(actual.versions.rsvg, "2.63.2"), file);
  }
});

test("patched librsvg still decodes SVG, composites overlays and encodes image formats", async () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48">
    <rect width="64" height="48" fill="#ff0000"/></svg>`);
  const rendered = await sharp(svg).png().toBuffer();
  const { data, info } = await sharp(rendered).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 64);
  assert.equal(info.height, 48);
  assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <rect width="16" height="16" fill="#0000ff"/></svg>`);
  const composed = await sharp(rendered).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
  const pixel = await sharp(composed).extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel], [0, 0, 255]);
  for (const format of ["jpeg", "png", "webp"]) {
    const output = await sharp(composed).resize(32, 32).normalize().sharpen().toFormat(format).toBuffer();
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, format);
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 32);
  }
  // Exercise the actual dynamic-import consumer, not a replacement implementation.
  const transcoded = await mediaTranscoder.transcodeImage(svg);
  assert.equal(transcoded.codec, "webp@q72");
  assert.equal(transcoded.originalBytes, svg.length);
  assert.equal(transcoded.transcodedBytes, transcoded.data.length);
  const metadata = await sharp(transcoded.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 48);
});
