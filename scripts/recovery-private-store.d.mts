import { Bucket, CRC32C, Storage } from "@google-cloud/storage";

export function createRecoveryStorage(options?: {
  bucketId?: string;
  fetchImpl?: typeof fetch;
  StorageClass?: typeof Storage;
}): Promise<{ bucket: Bucket; bucketId: string }>;

export const MANAGED_STORAGE_CONTRACT: Readonly<{
  privacy: "private Replit App Storage; authenticated access required";
  retention: "retained-until-explicit-delete";
  fixedDurationLocked: false;
}>;

export function verifyManagedPrivateStorage(options: {
  bucket: Bucket;
  bucketId: string;
  fetchImpl?: typeof fetch;
  uuid?: string;
  canaryBytes?: Buffer;
}): Promise<typeof MANAGED_STORAGE_CONTRACT & {
  privacyProbe: string;
  anonymousStatus: number;
  canaryRemoved: true;
}>;

type RetainedObject = { name: string; generation: string; crc32c?: string; size: string };
type Readback = { sha256: string; crc32c: string; bytes: number };
type RecoveryOptions = {
  bucket: Bucket;
  readbackPath: string;
  sourceRevision: string;
  currentSourceHash: string;
  snapshotEvidence: unknown;
  now?: Date;
  uuid?: string;
  crcFactory?: () => CRC32C;
};
export function retainAndReadBackRecoveryDump(options: RecoveryOptions & {
  dumpPath: string;
  dumpSha256: string;
  sourceMajor: number;
}): Promise<{
  prefix: string;
  dumpObject: RetainedObject;
  manifestObject: RetainedObject & { sha256: string };
  readback: Readback;
}>;
export function retainAndReadBackPdimSnapshot(options: RecoveryOptions & {
  snapshotPath: string;
  snapshotSha256: string;
}): Promise<{
  prefix: string;
  snapshotObject: RetainedObject;
  manifestObject: RetainedObject & { sha256: string };
  readback: Readback;
}>;
export const recoveryPrivateStoreInternals: {
  DEFAULT_BUCKET_URL: string;
  REPLIT_ADC: {
    audience: string;
    subject_token_type: string;
    token_url: string;
    type: string;
    credential_source: { url: string; format: { type: string; subject_token_field_name: string } };
    universe_domain: string;
  };
  downloadAndVerify(
    bucket: Bucket, object: RetainedObject, destination: string,
    expectedSha256: string, crcFactory?: () => CRC32C,
  ): Promise<Readback>;
};
