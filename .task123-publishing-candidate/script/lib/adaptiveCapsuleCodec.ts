import { codecMesh } from "../../server/pocket-dimension/fabric/compression/CodecMesh.js";
import { encodeContainer, decodeContainer, isContainer } from "../../server/pocket-dimension/fabric/compression/ContainerFormat.js";
import { awarenessProfiler } from "../../server/pocket-dimension/fabric/compression/AwarenessProfiler.js";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

// Build-only optimization: spawning a zstd process per tiny source file costs
// more than compression. Keep the same level/window and PDCF wire format.
// Large inputs still use the adaptive mesh and its block worker pool.
const NATIVE_SMALL_LIMIT = 256 * 1024;

// The same self-describing format used by the application's PocketDimension.
export const adaptiveCapsuleCodec = {
  canDecode: isContainer,
  async compress(data: Buffer): Promise<Buffer> {
    if (data.length <= NATIVE_SMALL_LIMIT) {
      const store = awarenessProfiler.profile(data, null).recommendation === "store";
      const compressed = store ? data : zstdCompressSync(data, {
        params: {
          [constants.ZSTD_c_compressionLevel]: 19,
          [constants.ZSTD_c_enableLongDistanceMatching]: 1,
          [constants.ZSTD_c_windowLog]: 27,
        },
      });
      return encodeContainer({
        profile: "lossless-max-dedup", contentClass: "unknown",
        codec: store ? "store" : "zstd", isDelta: false, originalBytes: data.length,
      }, compressed);
    }
    const result = await codecMesh.compress(data, { contentClass: "unknown" });
    return encodeContainer({
      profile: "lossless-max-dedup", contentClass: "unknown",
      codec: result.codec, isDelta: false, originalBytes: data.length,
      ...(result.dictId ? { dictId: result.dictId } : {}),
      ...(result.blockSizes ? { blockSizes: result.blockSizes } : {}),
    }, result.compressed);
  },
  async decompress(data: Buffer): Promise<Buffer> {
    const { header, payload } = decodeContainer(data);
    if (header.codec === "zstd" && !header.dictId && header.originalBytes <= NATIVE_SMALL_LIMIT) {
      const decoded = zstdDecompressSync(payload, { maxOutputLength: NATIVE_SMALL_LIMIT });
      if (decoded.length !== header.originalBytes) throw new Error("Capsule decoded length mismatch");
      return decoded;
    }
    return codecMesh.decompress(header.codec, payload, {
      dictId: header.dictId, blockSizes: header.blockSizes,
    });
  },
};
