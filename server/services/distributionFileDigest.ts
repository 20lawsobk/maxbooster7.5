import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const MAX_DISTRIBUTION_AUDIO_BYTES = 512 * 1024 * 1024;

export interface DistributionFileDigest {
  sha256: string;
  byteLength: number;
}

/** Hash the exact stored file bytes without buffering the whole audio asset. */
export async function sha256DistributionFile(
  filePath: string,
): Promise<DistributionFileDigest> {
  const before = await stat(filePath);
  if (!before.isFile() || before.size <= 0) {
    throw new Error("Audio asset is empty or is not a regular file");
  }
  if (before.size > MAX_DISTRIBUTION_AUDIO_BYTES) {
    throw new Error("Audio asset exceeds the 512 MiB fingerprint limit");
  }

  const hash = createHash("sha256");
  let byteLength = 0;
  for await (const chunk of createReadStream(filePath)) {
    byteLength += chunk.length;
    if (byteLength > MAX_DISTRIBUTION_AUDIO_BYTES) {
      throw new Error("Audio asset exceeds the 512 MiB fingerprint limit");
    }
    hash.update(chunk);
  }

  const after = await stat(filePath);
  if (byteLength !== before.size || after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs) {
    throw new Error("Audio asset changed while its digest was being computed");
  }

  return { sha256: hash.digest("hex"), byteLength };
}
