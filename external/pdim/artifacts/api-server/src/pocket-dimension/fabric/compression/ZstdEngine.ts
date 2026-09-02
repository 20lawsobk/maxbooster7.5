import * as zlib from "zlib";
import { constants as zlibConstants } from "zlib";
import { promisify } from "util";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

// Node >=22.15 exposes zstd in zlib; older runtimes (e.g. Node 20) do not.
// Detect at load time and fall back to Brotli so the engine works everywhere.
// Frames are self-describing on read: zstd has magic 28 B5 2F FD, gzip 1F 8B,
// anything else is treated as Brotli.
const HAS_ZSTD = typeof (zlib as any).zstdCompress === "function";
const zstdCompressAsync = HAS_ZSTD
  ? promisify((zlib as any).zstdCompress)
  : null;
const zstdDecompressAsync = HAS_ZSTD
  ? promisify((zlib as any).zstdDecompress)
  : null;
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

const DICT_DIR = path.join("./pocket-dimensions", ".dicts");
const DICT_SAMPLE_MAX = 200;
const DICT_SIZE = 112 * 1024;
const ZSTD_LEVEL = 9;

/** Adaptive effort: max on small payloads, throughput on huge ones. */
function zstdLevelFor(size: number): number {
  if (size <= 1024 * 1024) return 19;
  if (size <= 8 * 1024 * 1024) return 15;
  return ZSTD_LEVEL;
}
function brotliQualityFor(size: number): number {
  if (size <= 1024 * 1024) return 11;
  if (size <= 8 * 1024 * 1024) return 10;
  return 9;
}

interface DictEntry {
  id: string;
  domain: string;
  sampleCount: number;
  dictBytes: number;
  createdAt: Date;
}

export class ZstdEngine {
  private dictCache = new Map<string, Buffer>();
  private sampleAccumulator = new Map<string, Buffer[]>();
  private dictMeta = new Map<string, DictEntry>();

  async compress(
    data: Buffer,
    dictId?: string,
  ): Promise<{ compressed: Buffer; dictId?: string }> {
    const dict = dictId ? await this.loadDict(dictId) : undefined;

    if (HAS_ZSTD && zstdCompressAsync) {
      const opts: any = {
        params: {
          [(zlibConstants as any).ZSTD_c_compressionLevel]: zstdLevelFor(
            data.length,
          ),
        },
      };

      if (dict) {
        // ZSTD_c_enableDedupSequences may not be exposed in all Node.js builds
        const ZSTD_c_enableDedupSequences = (zlibConstants as any)
          .ZSTD_c_enableDedupSequences;
        if (ZSTD_c_enableDedupSequences !== undefined) {
          opts.params[ZSTD_c_enableDedupSequences] = 1;
        }
      }

      const compressed = await zstdCompressAsync(data, opts);
      return { compressed: compressed as Buffer, dictId };
    }

    // Brotli fallback for runtimes without zlib zstd support.
    const compressed = await brotliCompressAsync(data, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: brotliQualityFor(data.length),
        [zlibConstants.BROTLI_PARAM_LGWIN]:
          zlibConstants.BROTLI_MAX_WINDOW_BITS,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length,
      },
    });
    return { compressed: compressed as Buffer, dictId };
  }

  async decompress(data: Buffer): Promise<Buffer> {
    // Sniff the frame type so data written by either codec always reads back.
    const isZstd =
      data.length >= 4 &&
      data[0] === 0x28 &&
      data[1] === 0xb5 &&
      data[2] === 0x2f &&
      data[3] === 0xfd;
    if (isZstd) {
      if (!zstdDecompressAsync) {
        throw new Error(
          "Stored object is zstd-compressed but this Node runtime lacks zlib zstd support (need Node >=22.15)",
        );
      }
      return (await zstdDecompressAsync(data)) as Buffer;
    }
    return (await brotliDecompressAsync(data)) as Buffer;
  }

  async addSample(domain: string, sample: Buffer): Promise<void> {
    if (!this.sampleAccumulator.has(domain)) {
      this.sampleAccumulator.set(domain, []);
    }
    const samples = this.sampleAccumulator.get(domain)!;
    if (samples.length < DICT_SAMPLE_MAX) {
      samples.push(sample);
    }
  }

  async trainDict(domain: string): Promise<string | null> {
    const samples = this.sampleAccumulator.get(domain);
    if (!samples || samples.length < 10) return null;

    const combined = Buffer.concat(samples);
    const dictId = createHash("sha256")
      .update(`${domain}:${samples.length}:${combined.length}`)
      .digest("hex")
      .substring(0, 16);

    const existing = this.dictMeta.get(domain);
    if (existing && existing.sampleCount >= samples.length) {
      return existing.id;
    }

    const dictData = this.buildDict(combined, samples);

    await this.persistDict(dictId, domain, dictData, samples.length);
    this.dictCache.set(dictId, dictData);

    const entry: DictEntry = {
      id: dictId,
      domain,
      sampleCount: samples.length,
      dictBytes: dictData.length,
      createdAt: new Date(),
    };
    this.dictMeta.set(domain, entry);

    return dictId;
  }

  async getDictForDomain(domain: string): Promise<string | undefined> {
    const entry = this.dictMeta.get(domain);
    return entry?.id;
  }

  private buildDict(combined: Buffer, samples: Buffer[]): Buffer {
    const target = Math.min(DICT_SIZE, Math.floor(combined.length * 0.02));
    const chunkSize = Math.floor(target / (samples.length || 1));
    const chunks: Buffer[] = [];

    for (const sample of samples) {
      const take = Math.min(chunkSize, sample.length);
      chunks.push(sample.subarray(0, take));
    }

    return Buffer.concat(chunks).subarray(0, target);
  }

  private async loadDict(id: string): Promise<Buffer | undefined> {
    if (this.dictCache.has(id)) return this.dictCache.get(id)!;
    try {
      const data = await fs.readFile(path.join(DICT_DIR, `${id}.dict`));
      this.dictCache.set(id, data);
      return data;
    } catch {
      return undefined;
    }
  }

  private async persistDict(
    id: string,
    domain: string,
    data: Buffer,
    sampleCount: number,
  ): Promise<void> {
    await fs.mkdir(DICT_DIR, { recursive: true });
    await fs.writeFile(path.join(DICT_DIR, `${id}.dict`), data);
    await fs.writeFile(
      path.join(DICT_DIR, `${id}.meta.json`),
      JSON.stringify({
        id,
        domain,
        sampleCount,
        dictBytes: data.length,
        createdAt: new Date(),
      }),
    );
  }

  async compressionRatio(data: Buffer, dictId?: string): Promise<number> {
    const { compressed } = await this.compress(data, dictId);
    return data.length / (compressed.length || 1);
  }
}

export const zstdEngine = new ZstdEngine();
