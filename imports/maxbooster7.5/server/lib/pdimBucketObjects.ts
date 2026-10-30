import type { Bucket } from "@google-cloud/storage";
import type { PdimObjectStore } from "./pdimBucketJournal.js";
import { createRecoveryStorage } from "../../scripts/recovery-private-store.mjs";

/** Authenticated App Storage adapter. Reads are pinned to the observed
 * generation; a deletion/replacement during download is an error, not a miss. */
export class PdimBucketObjects implements PdimObjectStore {
  constructor(private readonly bucket: Pick<Bucket, "file">) {}

  async read(key: string): Promise<{ bytes: Buffer; generation: string } | null> {
    const file = this.bucket.file(key);
    let generation: string;
    try {
      const [metadata] = await file.getMetadata();
      if (typeof metadata.generation !== "string") throw new Error("Missing object generation");
      generation = metadata.generation;
    } catch (error) {
      if ((error as { code?: unknown }).code === 404) return null;
      throw error;
    }
    const [bytes] = await this.bucket.file(key, { generation }).download({ validation: "crc32c" });
    return { bytes, generation };
  }

  async write(key: string, bytes: Buffer, generation: string | 0): Promise<string> {
    const file = this.bucket.file(key);
    await file.save(bytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: generation },
    });
    // The upload response populates this File instance's metadata. Never obtain
    // a replacement writer's generation using an unpinned getMetadata here.
    const published = file.metadata.generation;
    if (typeof published !== "string") throw new Error("Upload returned no generation receipt");
    return published;
  }
}

export async function configuredPdimBucketObjects(): Promise<PdimBucketObjects> {
  const bucketId = process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID;
  if (!bucketId) throw new Error("PDIM App Storage bucket is not configured");
  const { bucket } = await createRecoveryStorage({ bucketId });
  return new PdimBucketObjects(bucket);
}
