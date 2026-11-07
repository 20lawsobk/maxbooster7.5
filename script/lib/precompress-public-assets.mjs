import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants,
  gunzip,
  gzip,
} from "node:zlib";
import { promisify } from "node:util";

const compressible = /\.(?:js|css|svg|html|json|txt|xml|webmanifest)$/i;
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

async function collectAssets(directory) {
  const assets = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Unsupported symlink in public assets: ${filename}`);
    }
    if (entry.isDirectory()) {
      assets.push(...await collectAssets(filename));
    } else if (entry.isFile() && compressible.test(entry.name)) {
      assets.push(filename);
    }
  }
  return assets.sort();
}

async function writeCompressed(source, target, contents) {
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, contents, { flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function ensureVariant(source, suffix, compress, decompress) {
  const target = `${source}${suffix}`;
  const original = await fs.readFile(source);
  let existing;
  try {
    existing = await fs.readFile(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existing) {
    let restored;
    try {
      restored = await decompress(existing);
    } catch {
      throw new Error(`Existing compressed public asset is invalid: ${target}`);
    }
    if (!restored.equals(original)) {
      throw new Error(`Existing compressed public asset does not match its source: ${target}`);
    }
    return false;
  }

  const compressed = await compress(original);
  await writeCompressed(source, target, compressed);
  return true;
}

/**
 * Generate immutable static compression variants before the build contract is
 * written. The contract then hashes every variant, so startup never mutates
 * dist/public and every later start validates the same artifact set.
 */
export async function precompressPublicAssets(root, { concurrency = 4 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("Compression concurrency must be an integer from 1 to 16");
  }
  const assetsDirectory = path.join(root, "dist", "public", "assets");
  const directoryStat = await fs.stat(assetsDirectory).catch(() => null);
  if (!directoryStat?.isDirectory()) {
    throw new Error("Vite public assets directory is missing; cannot precompress build outputs");
  }

  const assets = await collectAssets(assetsDirectory);
  let cursor = 0;
  let filesWritten = 0;
  let filesVerified = 0;
  async function worker() {
    while (cursor < assets.length) {
      const source = assets[cursor++];
      const [brotliWritten, gzipWritten] = await Promise.all([
        ensureVariant(
          source,
          ".br",
          (input) => brotliCompressAsync(input, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 },
          }),
          brotliDecompressAsync,
        ),
        ensureVariant(
          source,
          ".gz",
          (input) => gzipAsync(input, { level: 9 }),
          gunzipAsync,
        ),
      ]);
      filesWritten += Number(brotliWritten) + Number(gzipWritten);
      filesVerified += 2 - Number(brotliWritten) - Number(gzipWritten);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, assets.length || 1) }, worker));
  return { sourceFiles: assets.length, filesWritten, filesVerified };
}
