import { codecMesh } from "../../server/pocket-dimension/fabric/compression/CodecMesh.js";
import { encodeContainer, decodeContainer, isContainer } from "../../server/pocket-dimension/fabric/compression/ContainerFormat.js";

// The same self-describing format used by the application's PocketDimension.
export const adaptiveCapsuleCodec = {
  canDecode: isContainer,
  async compress(data: Buffer): Promise<Buffer> {
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
    return codecMesh.decompress(header.codec, payload, {
      dictId: header.dictId, blockSizes: header.blockSizes,
    });
  },
};
