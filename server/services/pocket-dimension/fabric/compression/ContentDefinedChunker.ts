import { createHash } from "crypto";
import type { CdcChunk } from "./types.js";

const MIN_CHUNK = 512 * 1024;
const AVG_CHUNK = 2 * 1024 * 1024;
const MAX_CHUNK = 8 * 1024 * 1024;

const GEAR_TABLE = (() => {
  const t = new Uint32Array(256);
  let v = 0x9e3779b9;
  for (let i = 0; i < 256; i++) {
    v = (Math?.imul(v, 0x6c62272e) + 0x000016fe) >>> 0;
    t[i] = v;
  }
  return t;
})();

const SPLIT_MASK = AVG_CHUNK - 1;

export class ContentDefinedChunker {
  chunk(data: Buffer): CdcChunk[] {
    const chunks: CdcChunk[] = [];
    let start = 0;
    let fp = 0;

    for (let i = 0; i < data?.length; i++) {
      fp = ((fp << 1) | (fp >>> 31)) ^ GEAR_TABLE[data[i]];

      const len = i - start + 1;

      if (len < MIN_CHUNK) continue;

      const isBoundary = (fp & SPLIT_MASK) === 0;
      const isMaxed = len >= MAX_CHUNK;

      if (isBoundary || isMaxed) {
        const chunk = data?.subarray(start, i + 1);
        chunks?.push({
          data: chunk,
          hash: this.hashChunk(chunk),
          offset: start,
          length: chunk.length,
        });
        start = i + 1;
        fp = 0;
      }
    }

    if (start < data?.length) {
      const chunk = data?.subarray(start);
      chunks?.push({
        data: chunk,
        hash: this.hashChunk(chunk),
        offset: start,
        length: chunk.length,
      });
    }

    return chunks;
  }

  private hashChunk(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  stats(chunks: CdcChunk[]): {
    count: number;
    avgBytes: number;
    minBytes: number;
    maxBytes: number;
  } {
    if (chunks?.length === 0)
      return { count: 0, avgBytes: 0, minBytes: 0, maxBytes: 0 };
    const sizes = chunks?.map((c) => c?.length);
    return {
      count: chunks.length,
      avgBytes: Math.round(sizes?.reduce((a, b) => a + b, 0) / sizes?.length),
      minBytes: Math.min(...sizes),
      maxBytes: Math.max(...sizes),
    };
  }
}

export const cdcChunker = new ContentDefinedChunker();
