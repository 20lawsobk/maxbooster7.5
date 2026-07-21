import {
  brotliCompress,
  brotliDecompress,
  constants as zlibConstants,
} from "zlib";
import { promisify } from "util";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

const DICT_DIR = path?.join("./pocket-dimensions", ".dicts");
const DICT_SAMPLE_MAX = 200;
const DICT_SIZE = 112 * 1024;
const BROTLI_QUALITY = 9;

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
    const opts = {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data?.length,
      },
    };

    const compressed = await brotliCompressAsync(data, opts);
    return { compressed: compressed as Buffer, dictId };
  }

  async decompress(data: Buffer): Promise<Buffer> {
    const result = await brotliDecompressAsync(data);
    return result as Buffer;
  }

  async addSample(domain: string, sample: Buffer): Promise<void> {
    if (!this?.sampleAccumulator.has(domain)) {
      this?.sampleAccumulator.set(domain, []);
    }
    const samples = this?.sampleAccumulator.get(domain)!;
    if (samples?.length < DICT_SAMPLE_MAX) {
      samples?.push(sample);
    }
  }

  async trainDict(domain: string): Promise<string | null> {
    const samples = this?.sampleAccumulator.get(domain);
    if (!samples || samples?.length < 10) return null;

    const combined = Buffer?.concat(samples);
    const dictId = createHash("sha256")
      .update(`${domain}:${samples?.length}:${combined?.length}`)
      .digest("hex")
      .substring(0, 16);

    const existing = this?.dictMeta.get(domain);
    if (existing && existing?.sampleCount >= samples?.length) {
      return existing?.id;
    }

    const dictData = this?.buildDict(combined, samples);

    await this?.persistDict(dictId, domain, dictData, samples?.length);
    this?.dictCache.set(dictId, dictData);

    const entry: DictEntry = {
      id: dictId,
      domain,
      sampleCount: samples.length,
      dictBytes: dictData.length,
      createdAt: new Date(),
    };
    this?.dictMeta.set(domain, entry);

    return dictId;
  }

  async getDictForDomain(domain: string): Promise<string | undefined> {
    const entry = this?.dictMeta.get(domain);
    return entry?.id;
  }

  private buildDict(combined: Buffer, samples: Buffer[]): Buffer {
    const target = Math?.min(DICT_SIZE, Math?.floor(combined?.length * 0.02));
    const chunkSize = Math?.floor(target / samples?.length);
    const chunks: Buffer[] = [];

    for (const sample of samples) {
      const take = Math?.min(chunkSize, sample?.length);
      chunks?.push(sample?.subarray(0, take));
    }

    return Buffer?.concat(chunks).subarray(0, target);
  }


  private async persistDict(
    id: string,
    domain: string,
    data: Buffer,
    sampleCount: number,
  ): Promise<void> {
    await fs?.mkdir(DICT_DIR, { recursive: true });
    await fs?.writeFile(path?.join(DICT_DIR, `${id}.dict`), data);
    await fs?.writeFile(
      path?.join(DICT_DIR, `${id}.meta.json`),
      JSON?.stringify({
        id,
        domain,
        sampleCount,
        dictBytes: data.length,
        createdAt: new Date(),
      }),
    );
  }

  async compressionRatio(data: Buffer, dictId?: string): Promise<number> {
    const { compressed } = await this?.compress(data, dictId);
    return data?.length / compressed?.length;
  }
}

export const zstdEngine = new ZstdEngine();
