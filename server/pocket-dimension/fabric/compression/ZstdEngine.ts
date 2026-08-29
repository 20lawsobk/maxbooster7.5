/**
 * ZSTD ENGINE
 *
 * Despite the class name, this previously never invoked zstd at all — it
 * was a pure Brotli wrapper, and `buildDict()` just truncated/concatenated
 * raw sample bytes rather than training a real dictionary. Both are fixed
 * here:
 *
 *  - `compress`/`decompress` shell out to the real `zstd` CLI (confirmed
 *    present, v1.5.7+) via piped stdin/stdout (no temp files on the hot
 *    path). Brotli is kept ONLY as a defensive fallback if the zstd binary
 *    invocation itself fails at runtime — and the returned `codec` field
 *    always honestly reflects which one actually ran, so a caller (or the
 *    container header) never mislabels brotli-compressed bytes as zstd.
 *  - `trainDict` shells out to real `zstd --train` (dictionary training
 *    needs real sample files on disk, not a stream, so samples are
 *    written to a scratch temp dir and cleaned up after training).
 *  - Trained dictionaries are persisted to disk (as before) AND now
 *    reloaded from disk on demand, so a process restart does not silently
 *    lose the ability to decompress data that was compressed with a
 *    dictionary trained in a prior process.
 *
 * Decompression never silently falls back: if the caller says a payload
 * is "zstd" and the zstd binary can't decode it, that is a real error and
 * is thrown, not masked — silently trying a different codec on
 * undecodable bytes risks producing wrong output instead of failing loud.
 */
import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants,
} from "zlib";
import { promisify } from "util";
import { createHash } from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { logger } from "../../../logger.js";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

const DICT_DIR = path.join("./pocket-dimensions", ".dicts");
const DICT_SAMPLE_MAX = 200;
const DICT_SIZE = 112 * 1024;
const BROTLI_QUALITY = 9;

export type ZstdCodec = "zstd" | "brotli-fallback";

/** Adaptive quality: max effort on small payloads, throughput on huge ones. */
function qualityFor(size: number): number {
  if (size <= 1024 * 1024) return 11;
  if (size <= 8 * 1024 * 1024) return 10;
  return BROTLI_QUALITY;
}

/** Adaptive zstd level: mirrors the brotli quality curve's intent —
 *  near-max ratio on small payloads, faster levels as size grows so a
 *  single big object doesn't stall the request path. */
function zstdLevelFor(size: number): number {
  if (size <= 1024 * 1024) return 19;
  if (size <= 8 * 1024 * 1024) return 15;
  return 12;
}

interface DictEntry {
  id: string;
  domain: string;
  sampleCount: number;
  dictBytes: number;
  createdAt: Date;
}

async function brotliCompressBytes(data: Buffer): Promise<Buffer> {
  const opts = {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: qualityFor(data?.length ?? 0),
      [zlibConstants.BROTLI_PARAM_LGWIN]: zlibConstants.BROTLI_MAX_WINDOW_BITS,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data?.length,
    },
  };
  return (await brotliCompressAsync(data, opts)) as Buffer;
}

function runZstdPiped(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("zstd", args);
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `zstd exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`,
          ),
        );
      }
    });
    proc.stdin.on("error", () => {
      /* surfaced via close/exit above */
    });
    proc.stdin.end(input);
  });
}

function runZstdArgs(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("zstd", args);
    const errChunks: Buffer[] = [];
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", () => resolve({ code: -1, stderr: "spawn error" }));
    proc.on("close", (code) =>
      resolve({ code: code ?? -1, stderr: Buffer.concat(errChunks).toString("utf8") }),
    );
  });
}

export class ZstdEngine {
  private dictCache = new Map<string, Buffer>();
  private sampleAccumulator = new Map<string, Buffer[]>();
  private dictMeta = new Map<string, DictEntry>();
  private diskMetaScanned = false;
  private zstdAvailable: boolean | null = null;

  private async checkZstdAvailable(): Promise<boolean> {
    if (this.zstdAvailable !== null) return this.zstdAvailable;
    this.zstdAvailable = await new Promise<boolean>((resolve) => {
      const p = spawn("zstd", ["--version"]);
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
    if (!this.zstdAvailable) {
      logger.warn(
        "[ZstdEngine] `zstd` CLI not available — all compression will use the Brotli fallback",
      );
    }
    return this.zstdAvailable;
  }

  private async dictPathFor(dictId: string): Promise<string | null> {
    const p = path.join(DICT_DIR, `${dictId}.dict`);
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }

  async compress(
    data: Buffer,
    dictId?: string,
  ): Promise<{ compressed: Buffer; dictId?: string; codec: ZstdCodec }> {
    const available = await this.checkZstdAvailable();
    if (available) {
      try {
        const args = [`-${zstdLevelFor(data.length)}`, "--long=27", "-T0", "-c"];
        let usedDictId: string | undefined;
        if (dictId) {
          const dictPath = await this.dictPathFor(dictId);
          if (dictPath) {
            args.push("-D", dictPath);
            usedDictId = dictId;
          } else {
            logger.warn(
              `[ZstdEngine] dictId "${dictId}" has no dict file on disk — compressing without it`,
            );
          }
        }
        const compressed = await runZstdPiped(args, data);
        return { compressed, dictId: usedDictId, codec: "zstd" };
      } catch (err) {
        logger.warn(
          `[ZstdEngine] zstd CLI compression failed (${(err as Error).message}) — falling back to Brotli for this object`,
        );
      }
    }
    const compressed = await brotliCompressBytes(data);
    return { compressed, dictId: undefined, codec: "brotli-fallback" };
  }

  async decompress(
    data: Buffer,
    dictId?: string,
    codec: ZstdCodec = "zstd",
  ): Promise<Buffer> {
    if (codec === "brotli-fallback") {
      return (await brotliDecompressAsync(data)) as Buffer;
    }

    const available = await this.checkZstdAvailable();
    if (!available) {
      throw new Error(
        "Object was compressed with zstd but the zstd CLI is not available on this host — cannot decompress",
      );
    }
    const args = ["-d", "--long=27", "-T0", "-c"];
    if (dictId) {
      const dictPath = await this.dictPathFor(dictId);
      if (!dictPath) {
        throw new Error(
          `Object was compressed with dictId "${dictId}" but that dictionary file is missing — cannot decompress`,
        );
      }
      args.push("-D", dictPath);
    }
    return runZstdPiped(args, data);
  }

  async addSample(domain: string, sample: Buffer): Promise<void> {
    if (!this.sampleAccumulator.has(domain)) {
      this.sampleAccumulator.set(domain, []);
    }
    const samples = this.sampleAccumulator.get(domain)!;
    if (samples?.length < DICT_SAMPLE_MAX) {
      samples?.push(sample);
    }
  }

  /** Trains a real zstd dictionary from accumulated samples via `zstd --train`.
   *  Needs real files on disk (zstd's trainer does not accept stdin), so
   *  samples are written to a scratch temp dir that is always cleaned up. */
  async trainDict(domain: string): Promise<string | null> {
    const samples = this.sampleAccumulator.get(domain);
    if (!samples || samples?.length < 10) return null;

    const available = await this.checkZstdAvailable();
    if (!available) {
      logger.warn(
        `[ZstdEngine] Cannot train dictionary for domain "${domain}" — zstd CLI not available`,
      );
      return null;
    }

    const combined = Buffer.concat(samples);
    const dictId = createHash("sha256")
      .update(`${domain}:${samples.length}:${combined.length}`)
      .digest("hex")
      .substring(0, 16);

    const existing = this.dictMeta.get(domain);
    if (existing && existing.sampleCount >= samples.length && existing.id === dictId) {
      return existing.id;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zstd-train-"));
    try {
      const samplePaths: string[] = [];
      for (let i = 0; i < samples.length; i++) {
        const p = path.join(tmpDir, `sample-${i}`);
        await fs.writeFile(p, samples[i]);
        samplePaths.push(p);
      }

      await fs.mkdir(DICT_DIR, { recursive: true });
      const dictPath = path.join(DICT_DIR, `${dictId}.dict`);

      const { code, stderr } = await runZstdArgs([
        "--train",
        ...samplePaths,
        "-o",
        dictPath,
        `--maxdict=${DICT_SIZE}`,
        "-f",
      ]);

      if (code !== 0) {
        logger.warn(
          `[ZstdEngine] zstd --train failed for domain "${domain}": ${stderr.slice(0, 500)}`,
        );
        return null;
      }

      const dictData = await fs.readFile(dictPath);
      this.dictCache.set(dictId, dictData);

      const entry: DictEntry = {
        id: dictId,
        domain,
        sampleCount: samples.length,
        dictBytes: dictData.length,
        createdAt: new Date(),
      };
      this.dictMeta.set(domain, entry);
      await fs.writeFile(
        path.join(DICT_DIR, `${dictId}.meta.json`),
        JSON.stringify(entry),
      );

      return dictId;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /** Populates in-memory dict metadata from disk once, so a fresh process
   *  (after a restart) can still resolve dictionaries trained earlier. */
  private async ensureDiskMetaScanned(): Promise<void> {
    if (this.diskMetaScanned) return;
    this.diskMetaScanned = true;
    try {
      const files = await fs.readdir(DICT_DIR);
      for (const f of files) {
        if (!f.endsWith(".meta.json")) continue;
        try {
          const raw = await fs.readFile(path.join(DICT_DIR, f), "utf8");
          const entry = JSON.parse(raw) as DictEntry;
          const current = this.dictMeta.get(entry.domain);
          if (!current || new Date(entry.createdAt) > new Date(current.createdAt)) {
            this.dictMeta.set(entry.domain, entry);
          }
        } catch {
          // corrupt/partial meta file — skip it, do not fail the whole scan
        }
      }
    } catch {
      // DICT_DIR doesn't exist yet — no dictionaries trained on this host yet
    }
  }

  async getDictForDomain(domain: string): Promise<string | undefined> {
    await this.ensureDiskMetaScanned();
    const entry = this.dictMeta.get(domain);
    return entry?.id;
  }

  async compressionRatio(data: Buffer, dictId?: string): Promise<number> {
    const { compressed } = await this.compress(data, dictId);
    return data?.length / compressed?.length;
  }
}

export const zstdEngine = new ZstdEngine();
