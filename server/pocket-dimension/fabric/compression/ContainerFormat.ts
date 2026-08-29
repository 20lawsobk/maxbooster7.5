/**
 * CONTAINER FORMAT (the "orchestrator" envelope)
 *
 * Every compressed object is wrapped in a small self-describing envelope
 * before it is handed to the storage layer for chunking/placement. This is
 * what makes decompression possible at all: the codec, dictionary id, and
 * delta-base reference travel WITH the bytes instead of living only in a
 * side table that could drift out of sync or be missing entirely (which is
 * exactly the bug this replaces — the fabric used to discard this
 * information after compressing, making stored objects undecodable).
 *
 * Layout (all integers little-endian):
 *   [0..3]   magic       "PDCF" (Pocket Dimension Compression Format)
 *   [4]      version     format version (currently 1)
 *   [5..8]   headerLen   uint32, length of the JSON header in bytes
 *   [9..]    header      JSON-encoded ContainerHeader, `headerLen` bytes
 *   [..end]  payload     the actual codec payload
 */

export interface ContainerHeader {
  profile: string;
  contentClass: string;
  codec: string;
  isDelta: boolean;
  deltaBaseId?: string;
  dictId?: string;
  originalBytes: number;
  /** Present only for profile=semantic-archive: informational summary,
   *  never a substitute for the real (separately compressed) payload. */
  semanticSummary?: Record<string, unknown>;
  /** Present when the payload was split for parallel block compression. */
  blockSizes?: number[];
  blockCodec?: string;
}

const MAGIC = Buffer.from("PDCF", "ascii");
const FORMAT_VERSION = 1;

export function encodeContainer(header: ContainerHeader, payload: Buffer): Buffer {
  const headerJson = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(4 + 1 + 4);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt8(FORMAT_VERSION, 4);
  prefix.writeUInt32LE(headerJson.length, 5);
  return Buffer.concat([prefix, headerJson, payload]);
}

export function decodeContainer(buf: Buffer): {
  header: ContainerHeader;
  payload: Buffer;
} {
  if (buf.length < 9 || !buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error(
      "Corrupt or non-container object: missing PDCF magic bytes — cannot decompress",
    );
  }
  const version = buf.readUInt8(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(
      `Unsupported container format version ${version} (expected ${FORMAT_VERSION})`,
    );
  }
  const headerLen = buf.readUInt32LE(5);
  const headerStart = 9;
  const headerEnd = headerStart + headerLen;
  if (buf.length < headerEnd) {
    throw new Error("Corrupt container: header length exceeds buffer size");
  }
  const header: ContainerHeader = JSON.parse(
    buf.subarray(headerStart, headerEnd).toString("utf8"),
  );
  const payload = buf.subarray(headerEnd);
  return { header, payload };
}

/** Cheap check without fully parsing — used by callers deciding whether
 *  a buffer needs decoding at all. */
export function isContainer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC);
}
