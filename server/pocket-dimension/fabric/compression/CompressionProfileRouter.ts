import { createHash } from "crypto";
import { zstdEngine } from "./ZstdEngine.js";
import { deltaEngine } from "./DeltaEngine.js";
import { mediaTranscoder, classifyContentType } from "./MediaTranscoder.js";
import { semanticArchiver } from "./SemanticArchiver.js";
import { codecMesh } from "./CodecMesh.js";
import { encodeContainer, decodeContainer, type ContainerHeader } from "./ContainerFormat.js";
import type {
  CompressionProfile,
  ContentClass,
  StoreOptions,
  CompressionResult,
} from "./types.js";
import { logger } from "../../../logger.js";

const MEDIA_CLASSES = new Set<ContentClass>(["video", "audio", "image"]);
const SEMANTIC_CLASSES = new Set<ContentClass>([
  "json",
  "log",
  "text",
  "metrics",
]);

const LOSSY_SIZE_THRESHOLD = 5 * 1024 * 1024;

// Minimum improvement a delta must deliver over a straight compress of the
// full new version before it's worth paying the cost of resolving/keeping a
// base object around at read time. Matches the prior threshold's intent.
const DELTA_WORTHWHILE_RATIO = 0.8;

/**
 * Routes each object to one of three compression profiles by content
 * class, then hands the actual codec decision to the CodecMesh (which
 * reads real entropy/format signals rather than assuming one codec per
 * profile). This class is intentionally stateless across calls — no
 * object bytes are cached here between requests. Delta versioning needs
 * the real bytes of a prior version; the caller (PocketStorageService)
 * resolves that from real storage via `getObject()` and passes them in,
 * so `deltaBaseId` is always a real, independently-retrievable object
 * rather than an opaque key into a Map that a process restart would
 * silently empty.
 */
export class CompressionProfileRouter {
  chooseProfile(
    contentClass: ContentClass,
    opts: StoreOptions,
  ): CompressionProfile {
    if (opts?.profile) return opts?.profile;

    if (MEDIA_CLASSES?.has(contentClass)) {
      const size = opts?.sizeHintBytes ?? 0;
      if (
        opts?.allowLossy !== false &&
        (size === 0 || size >= LOSSY_SIZE_THRESHOLD)
      ) {
        return "media-lossy";
      }
      return "lossless-max-dedup";
    }

    if (SEMANTIC_CLASSES?.has(contentClass)) {
      return "semantic-archive";
    }

    return "lossless-max-dedup";
  }

  /**
   * @param priorVersionData Real bytes of the object named by
   *   `opts.versionOf`, already resolved by the caller. Only consulted by
   *   the lossless-max-dedup profile. Omit (or pass undefined) when there
   *   is no prior version, or it could not be resolved.
   */
  async process(
    data: Buffer,
    originalName: string,
    contentType: string,
    opts: StoreOptions = {},
    priorVersionData?: Buffer,
  ): Promise<CompressionResult> {
    const contentClass = classifyContentType(contentType, originalName);
    const profile = this.chooseProfile(contentClass, {
      ...opts,
      sizeHintBytes: data.length,
    });

    switch (profile) {
      case "media-lossy":
        return this.processMediaLossy(data, contentClass, originalName, opts);
      case "semantic-archive":
        return this.processSemanticArchive(data, contentClass, opts);
      default:
        return this.processLosslessMaxDedup(
          data,
          contentClass,
          originalName,
          opts,
          priorVersionData,
        );
    }
  }

  private async processLosslessMaxDedup(
    data: Buffer,
    contentClass: ContentClass,
    _originalName: string,
    opts: StoreOptions,
    priorVersionData?: Buffer,
  ): Promise<CompressionResult> {
    const domain = opts?.dimensionHint ?? contentClass;
    let processedData = data;
    let isDelta = false;
    let deltaBaseId: string | undefined;

    if (priorVersionData) {
      try {
        const delta = deltaEngine.encode(priorVersionData, data);
        if (delta.length < data.length * DELTA_WORTHWHILE_RATIO) {
          processedData = delta;
          isDelta = true;
          deltaBaseId = opts?.versionOf;
        }
      } catch (err) {
        logger.warn(
          `[CompressionRouter] Delta encode against versionOf=${opts?.versionOf} failed (${(err as Error).message}) — storing full version instead`,
        );
      }
    } else if (opts?.versionOf) {
      logger.warn(
        `[CompressionRouter] versionOf=${opts.versionOf} given but no prior version data was resolved — storing full version instead of a delta`,
      );
    }

    await zstdEngine?.addSample(domain, processedData?.subarray(0, 32 * 1024));

    const meshResult = await codecMesh.compress(processedData, {
      contentClass,
      dictDomain: domain,
    });

    const objectId = this.hashContent(data);

    return {
      data: meshResult.compressed,
      profile: "lossless-max-dedup",
      contentClass,
      originalBytes: data.length,
      compressedBytes: meshResult.compressed.length,
      ratio: data.length / meshResult.compressed.length,
      codec: meshResult.codec,
      isDelta,
      deltaBaseId,
      dictId: meshResult.dictId,
      blockSizes: meshResult.blockSizes,
      metadata: { objectId, domain },
    };
  }

  private async processMediaLossy(
    data: Buffer,
    contentClass: ContentClass,
    originalName: string,
    _opts: StoreOptions,
  ): Promise<CompressionResult> {
    let workingData = data;
    let transcodeCodec: string | null = null;
    let wasTranscoded = false;

    const transcodeResult = await mediaTranscoder?.transcode(
      data,
      contentClass,
      originalName,
    );

    if (transcodeResult && transcodeResult?.ratio > 1.1) {
      workingData = transcodeResult?.data;
      transcodeCodec = transcodeResult?.codec;
      wasTranscoded = true;
    }

    const domain = `media-${contentClass}`;
    const meshResult = await codecMesh.compress(workingData, {
      contentClass,
      dictDomain: domain,
    });

    return {
      data: meshResult.compressed,
      profile: "media-lossy",
      contentClass,
      originalBytes: data.length,
      compressedBytes: meshResult.compressed.length,
      ratio: data.length / meshResult.compressed.length,
      codec: meshResult.codec,
      isDelta: false,
      dictId: meshResult.dictId,
      blockSizes: meshResult.blockSizes,
      metadata: {
        transcoded: wasTranscoded,
        transcodeCodec: wasTranscoded ? transcodeCodec : null,
        domain,
      },
    };
  }

  private async processSemanticArchive(
    data: Buffer,
    contentClass: ContentClass,
    _opts: StoreOptions,
  ): Promise<CompressionResult> {
    // The archiver's summary is informational metadata only — it must
    // NEVER replace the real bytes in what gets compressed and stored.
    // (This was the critical bug: the router used to compress and store
    // only `archiveResult.data`, a lossy summary, discarding the real
    // content with no way to ever get it back.)
    const archiveResult = await semanticArchiver?.archive(data, contentClass);

    const domain = `semantic-${contentClass}`;
    await zstdEngine?.addSample(domain, data?.subarray(0, 32 * 1024));

    const meshResult = await codecMesh.compress(data, {
      contentClass,
      dictDomain: domain,
    });

    return {
      data: meshResult.compressed,
      profile: "semantic-archive",
      contentClass,
      originalBytes: data.length,
      compressedBytes: meshResult.compressed.length,
      ratio: data.length / meshResult.compressed.length,
      codec: meshResult.codec,
      isDelta: false,
      dictId: meshResult.dictId,
      blockSizes: meshResult.blockSizes,
      metadata: {
        archiveSummary: archiveResult.summary,
        domain,
      },
    };
  }

  /** Wraps a CompressionResult in the self-describing container envelope
   *  that storage actually persists. This is what makes the object
   *  decodable later without a side-channel lookup. */
  encodeForStorage(result: CompressionResult): Buffer {
    const header: ContainerHeader = {
      profile: result.profile,
      contentClass: result.contentClass,
      codec: result.codec,
      isDelta: result.isDelta,
      deltaBaseId: result.deltaBaseId,
      dictId: result.dictId,
      originalBytes: result.originalBytes,
      semanticSummary:
        result.profile === "semantic-archive"
          ? (result.metadata?.archiveSummary as Record<string, unknown> | undefined)
          : undefined,
      blockSizes: result.blockSizes,
    };
    return encodeContainer(header, result.data);
  }

  /** Reverses encodeForStorage. `resolveDeltaBase` is called only when the
   *  container is a delta, with the real deltaBaseId, and must return the
   *  full bytes of that prior version (e.g. via a real getObject call) —
   *  throwing rather than returning undefined if the base can't be found. */
  async decodeFromStorage(
    buf: Buffer,
    resolveDeltaBase: (deltaBaseId: string) => Promise<Buffer>,
  ): Promise<Buffer> {
    const { header, payload } = decodeContainer(buf);

    const decompressed = await codecMesh.decompress(header.codec, payload, {
      dictId: header.dictId,
      blockSizes: header.blockSizes,
    });

    if (header.isDelta) {
      if (!header.deltaBaseId) {
        throw new Error(
          "Container is marked isDelta but has no deltaBaseId — cannot reconstruct original bytes",
        );
      }
      const base = await resolveDeltaBase(header.deltaBaseId);
      return deltaEngine.decode(base, decompressed);
    }

    return decompressed;
  }

  async trainDictionaries(): Promise<Record<string, string | null>> {
    const domains = [
      "video",
      "audio",
      "image",
      "json",
      "log",
      "text",
      "metrics",
      "media-video",
      "media-audio",
      "media-image",
      "semantic-json",
      "semantic-log",
      "semantic-text",
      "semantic-metrics",
    ];

    const results: Record<string, string | null> = {};
    for (const d of domains) {
      results[d] = await zstdEngine?.trainDict(d);
    }
    return results;
  }

  private hashContent(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }
}

export const compressionRouter = new CompressionProfileRouter();
