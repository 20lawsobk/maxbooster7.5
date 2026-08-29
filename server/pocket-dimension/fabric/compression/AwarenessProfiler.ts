/**
 * AWARENESS PROFILER
 *
 * A real content-awareness pre-pass that runs before codec selection.
 * Instead of choosing a codec purely from MIME/extension (the old
 * behavior), this samples the actual bytes and measures:
 *
 *  - Shannon entropy (bits/byte) over a bounded sample — high entropy
 *    means the data is already dense (encrypted, already-compressed,
 *    or genuinely random) and spending CPU compressing it further is
 *    wasted work that can even grow the payload slightly.
 *  - Magic-byte sniffing for already-compressed / already-encoded
 *    container formats (gzip, zip, zstd, xz, bzip2, 7z, common media
 *    containers) so we do not re-compress data that will not shrink.
 *  - A cheap "looks like text" check so the codec mesh can prefer
 *    text-friendly codecs when useful.
 *
 * This is the "awareness layer" — its output is a recommendation, not
 * a mandate: callers stay free to override it, but by default it lets
 * the pipeline skip compressing incompressible data (a real, honest
 * throughput win) rather than always running a full compressor pass.
 */

export type CompressRecommendation = "store" | "compress";

export interface AwarenessProfile {
  sizeBytes: number;
  sampledBytes: number;
  entropyBitsPerByte: number;
  looksAlreadyCompressed: boolean;
  detectedFormat: string | null;
  looksText: boolean;
  recommendation: CompressRecommendation;
}

// Cap entropy sampling cost on huge buffers — a few hundred KB sampled
// from the front is statistically sufficient to estimate byte-distribution
// entropy for this purpose (we are deciding "worth compressing?", not
// computing a scientific entropy figure).
const MAX_SAMPLE_BYTES = 256 * 1024;

// Above this bits/byte, the data is dense enough that general-purpose
// compression essentially never pays for itself (empirically, real
// already-compressed media/archives land at 7.85-7.999; genuinely
// compressible text/json/logs land well under 7.5).
const HIGH_ENTROPY_THRESHOLD = 7.85;

interface MagicSignature {
  format: string;
  bytes: number[];
  offset?: number;
}

// Signatures for formats where re-compressing is essentially always a
// waste of CPU: already-compressed archives/codecs and common lossily
// encoded media containers.
const MAGIC_SIGNATURES: MagicSignature[] = [
  { format: "gzip", bytes: [0x1f, 0x8b] },
  { format: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { format: "zip-empty", bytes: [0x50, 0x4b, 0x05, 0x06] },
  { format: "zstd", bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { format: "xz", bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { format: "bzip2", bytes: [0x42, 0x5a, 0x68] },
  { format: "7z", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { format: "rar", bytes: [0x52, 0x61, 0x72, 0x21] },
  { format: "brotli-pdcf", bytes: [0x50, 0x44, 0x43, 0x46] }, // our own container, if double-wrapped
  { format: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { format: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: "mp3-id3", bytes: [0x49, 0x44, 0x33] },
  { format: "mp3-frame", bytes: [0xff, 0xfb] },
  { format: "flac", bytes: [0x66, 0x4c, 0x61, 0x43] },
  { format: "ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { format: "mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { format: "webm-mkv", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function matchesSignature(data: Buffer, sig: MagicSignature): boolean {
  const offset = sig.offset ?? 0;
  if (data.length < offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (data[offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

// RIFF (bytes 0-3 = "RIFF") is a generic container header shared by WebP,
// WAV, and AVI alike — the actual format only appears in the 4-byte tag at
// offset 8. A bare "RIFF" prefix match would misclassify plain, uncompressed
// PCM WAV audio as an already-compressed image (WebP) and skip compression
// entirely, which is wrong: WAV is not compressed. Require the "WEBP" tag
// specifically so only real WebP images are treated as already-compressed.
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];
const RIFF_FORMAT_TAG_OFFSET = 8;

function isRiffWebp(data: Buffer): boolean {
  if (data.length < RIFF_FORMAT_TAG_OFFSET + WEBP_TAG.length) return false;
  for (let i = 0; i < RIFF_MAGIC.length; i++) {
    if (data[i] !== RIFF_MAGIC[i]) return false;
  }
  for (let i = 0; i < WEBP_TAG.length; i++) {
    if (data[RIFF_FORMAT_TAG_OFFSET + i] !== WEBP_TAG[i]) return false;
  }
  return true;
}

function detectMagicFormat(data: Buffer): string | null {
  if (isRiffWebp(data)) return "webp";
  for (const sig of MAGIC_SIGNATURES) {
    if (matchesSignature(data, sig)) return sig.format;
  }
  return null;
}

/** Shannon entropy in bits/byte over the given sample. */
function shannonEntropy(sample: Buffer): number {
  if (sample.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < sample.length; i++) counts[sample[i]]++;

  let entropy = 0;
  const total = sample.length;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Cheap heuristic: sample is "text-like" if it's overwhelmingly printable ASCII/UTF-8. */
function looksLikeText(sample: Buffer): boolean {
  if (sample.length === 0) return true;
  let printable = 0;
  const checkLen = Math.min(sample.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    const b = sample[i];
    if (
      (b >= 0x20 && b <= 0x7e) ||
      b === 0x09 ||
      b === 0x0a ||
      b === 0x0d ||
      b >= 0x80 // permissive for UTF-8 continuation bytes
    ) {
      printable++;
    }
  }
  return printable / checkLen > 0.95;
}

export class AwarenessProfiler {
  profile(data: Buffer, contentTypeFormatHint?: string | null): AwarenessProfile {
    const sampleLen = Math.min(data.length, MAX_SAMPLE_BYTES);
    const sample = data.subarray(0, sampleLen);

    const detectedFormat = contentTypeFormatHint ?? detectMagicFormat(data);
    const entropyBitsPerByte = shannonEntropy(sample);
    const looksText = looksLikeText(sample);

    const looksAlreadyCompressed =
      detectedFormat !== null || entropyBitsPerByte >= HIGH_ENTROPY_THRESHOLD;

    const recommendation: CompressRecommendation = looksAlreadyCompressed
      ? "store"
      : "compress";

    return {
      sizeBytes: data.length,
      sampledBytes: sampleLen,
      entropyBitsPerByte,
      looksAlreadyCompressed,
      detectedFormat,
      looksText,
      recommendation,
    };
  }
}

export const awarenessProfiler = new AwarenessProfiler();
