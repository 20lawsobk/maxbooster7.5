/**
 * CODEC MESH (the "adaptive codec mesh")
 *
 * Chooses a real codec per object based on the AwarenessProfiler's read of
 * the actual bytes, content class, and size — not a fixed per-profile
 * codec. This is what makes the mesh "adaptive": the same content class
 * can land on a different codec depending on what the data actually looks
 * like and how big it is.
 *
 * Selection order:
 *  1. Already-compressed/high-entropy data (per AwarenessProfiler) → store
 *     verbatim. Spending CPU on data that won't shrink is a real cost with
 *     no benefit.
 *  2. Large payloads (>= BLOCK_PARALLEL_THRESHOLD) → parallel block
 *     compression across CPU cores (see ParallelBlockCompressor) when the
 *     worker pool is available, trading a small ratio cost (per-block
 *     framing) for real wall-clock throughput on big objects.
 *  3. Sizeable structured text (text/json/log/metrics over ~1MB) → xz,
 *    which reliably beats zstd/brotli on ratio for this shape of data at
 *    this size, and is not so large that xz's slower speed dominates.
 *  4. Everything else → zstd (with a real trained dictionary when the
 *     caller names a domain that has one), falling back to Brotli only if
 *     the zstd binary itself is unavailable or fails — always labeled
 *     honestly in the returned codec string.
 *
 * `decompress` is the exact inverse, dispatched purely off the codec label
 * recorded in the container header — it never re-derives or guesses which
 * path to take.
 */
import type { ContentClass } from "./types.js";
import { awarenessProfiler, type AwarenessProfile } from "./AwarenessProfiler.js";
import { zstdEngine } from "./ZstdEngine.js";
import { xzEngine } from "./XzEngine.js";
import {
  parallelBlockCompressor,
  BLOCK_PARALLEL_THRESHOLD,
} from "./ParallelBlockCompressor.js";
import { logger } from "../../../logger.js";

export type MeshCodec = "store" | "zstd" | "brotli-fallback" | "brotli-blocked" | "xz";

export interface CodecMeshCompressResult {
  codec: MeshCodec;
  compressed: Buffer;
  dictId?: string;
  blockSizes?: number[];
  awareness: AwarenessProfile;
}

export interface CodecMeshCompressOptions {
  contentClass: ContentClass;
  dictDomain?: string;
  contentTypeFormatHint?: string | null;
}

export interface CodecMeshDecompressOptions {
  dictId?: string;
  blockSizes?: number[];
}

const TEXT_LIKE: ReadonlySet<ContentClass> = new Set(["text", "json", "log", "metrics"]);
const XZ_MIN_SIZE = 1024 * 1024; // below this, xz's speed cost isn't worth the ratio gain

export class CodecMesh {
  async compress(
    data: Buffer,
    opts: CodecMeshCompressOptions,
  ): Promise<CodecMeshCompressResult> {
    const awareness = awarenessProfiler.profile(data, opts.contentTypeFormatHint ?? null);

    if (awareness.recommendation === "store") {
      return { codec: "store", compressed: data, awareness };
    }

    if (data.length >= BLOCK_PARALLEL_THRESHOLD) {
      const available = await parallelBlockCompressor.isAvailable();
      if (available) {
        try {
          const { blocks } = await parallelBlockCompressor.compressBlocks(data);
          return {
            codec: "brotli-blocked",
            compressed: Buffer.concat(blocks),
            blockSizes: blocks.map((b) => b.length),
            awareness,
          };
        } catch (err) {
          logger.warn(
            `[CodecMesh] Parallel block compression failed (${(err as Error).message}) — falling back to single-shot codec path`,
          );
        }
      }
    }

    if (TEXT_LIKE.has(opts.contentClass) && data.length >= XZ_MIN_SIZE) {
      const xzAvailable = await xzEngine.isAvailable();
      if (xzAvailable) {
        try {
          const compressed = await xzEngine.compress(data);
          return { codec: "xz", compressed, awareness };
        } catch (err) {
          logger.warn(
            `[CodecMesh] xz compression failed (${(err as Error).message}) — falling back to zstd`,
          );
        }
      }
    }

    let dictId: string | undefined;
    if (opts.dictDomain) {
      dictId = await zstdEngine.getDictForDomain(opts.dictDomain);
    }
    const result = await zstdEngine.compress(data, dictId);
    return {
      codec: result.codec,
      compressed: result.compressed,
      dictId: result.dictId,
      awareness,
    };
  }

  async decompress(
    codec: string,
    data: Buffer,
    opts: CodecMeshDecompressOptions = {},
  ): Promise<Buffer> {
    switch (codec) {
      case "store":
        return data;
      case "brotli-blocked": {
        if (!opts.blockSizes || opts.blockSizes.length === 0) {
          throw new Error(
            "Container labeled brotli-blocked but has no blockSizes — cannot reassemble",
          );
        }
        const blocks: Buffer[] = [];
        let pos = 0;
        for (const len of opts.blockSizes) {
          blocks.push(data.subarray(pos, pos + len));
          pos += len;
        }
        return parallelBlockCompressor.decompressBlocks(blocks);
      }
      case "xz":
        return xzEngine.decompress(data);
      case "zstd":
      case "brotli-fallback":
        return zstdEngine.decompress(data, opts.dictId, codec);
      default:
        throw new Error(`Unknown codec "${codec}" — cannot decompress`);
    }
  }
}

export const codecMesh = new CodecMesh();
