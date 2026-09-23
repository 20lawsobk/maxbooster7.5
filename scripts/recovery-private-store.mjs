import { createReadStream, createWriteStream } from "node:fs";
import { chmod, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import { Storage, CRC32C } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const DEFAULT_BUCKET_URL = `${SIDECAR}/object-storage/default-bucket`;
const REPLIT_ADC = Object.freeze({
  audience: "replit",
  subject_token_type: "access_token",
  token_url: `${SIDECAR}/token`,
  type: "external_account",
  credential_source: {
    url: `${SIDECAR}/credential`,
    format: { type: "json", subject_token_field_name: "access_token" },
  },
  universe_domain: "googleapis.com",
});

const assertSafeBucketId = value => {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/.test(value)) {
    throw new Error("Recovery bucket selection was missing or invalid");
  }
  return value;
};

export async function createRecoveryStorage({
  bucketId,
  fetchImpl = globalThis.fetch,
  StorageClass = Storage,
} = {}) {
  let selected = bucketId;
  if (!selected) {
    if (typeof fetchImpl !== "function") throw new Error("Sidecar default-bucket lookup is unavailable");
    const response = await fetchImpl(DEFAULT_BUCKET_URL);
    if (!response.ok) throw new Error(`Sidecar default-bucket lookup failed (${response.status})`);
    const body = await response.json();
    selected = body?.bucketId;
  }
  selected = assertSafeBucketId(selected);
  const client = new StorageClass({ credentials: REPLIT_ADC, projectId: "" });
  return { bucket: client.bucket(selected), bucketId: selected };
}

export async function verifyPrivateRetainedBucket(bucket, approvedRetentionSeconds) {
  const approved = Number(approvedRetentionSeconds);
  if (!Number.isSafeInteger(approved) || approved <= 0) {
    throw new Error("DATABASE_RECOVERY_APPROVED_RETENTION_SECONDS must be a positive integer");
  }
  const [[metadata], [policy]] = await Promise.all([
    bucket.getMetadata(),
    bucket.iam.getPolicy({ requestedPolicyVersion: 3 }),
  ]);
  const iam = metadata?.iamConfiguration;
  if (iam?.publicAccessPrevention !== "enforced") {
    throw new Error("Recovery bucket public access prevention is not enforced");
  }
  if (iam?.uniformBucketLevelAccess?.enabled !== true) {
    throw new Error("Recovery bucket uniform IAM is not enabled");
  }
  const publicMember = (policy?.bindings ?? []).some(binding =>
    (binding.members ?? []).some(member => member === "allUsers" || member === "allAuthenticatedUsers"));
  if (publicMember) throw new Error("Recovery bucket IAM contains a public member");
  const actual = Number(metadata?.retentionPolicy?.retentionPeriod);
  if (!Number.isSafeInteger(actual) || actual <= 0 || actual !== approved) {
    throw new Error("Recovery bucket retention does not exactly match the approved duration");
  }
  return {
    retentionSeconds: actual,
    retentionLocked: metadata.retentionPolicy?.isLocked === true,
    privacy: "public access prevention enforced; uniform IAM; no public IAM members",
  };
}

function generationOf(metadata) {
  const generation = String(metadata?.generation ?? "");
  if (!/^[1-9]\d*$/.test(generation)) throw new Error("Uploaded object has no valid immutable generation");
  return generation;
}

async function uploadCreateOnly(bucket, localPath, objectName, metadata) {
  const [uploaded] = await bucket.upload(localPath, {
    destination: objectName,
    resumable: false,
    validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: "application/octet-stream", metadata },
  });
  const [remote] = await uploaded.getMetadata();
  return {
    name: objectName,
    generation: generationOf(remote),
    crc32c: remote.crc32c,
    size: String(remote.size),
  };
}

async function downloadAndVerify(bucket, object, destination, expectedSha256, crcFactory = () => new CRC32C()) {
  const sha = createHash("sha256");
  const crc = crcFactory();
  let bytes = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      sha.update(chunk);
      crc.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  const remote = bucket.file(object.name, { generation: object.generation });
  await pipeline(
    remote.createReadStream({ validation: "crc32c" }),
    verifier,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  await chmod(destination, 0o600);
  const actualSha256 = sha.digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("Generation-bound recovery readback SHA-256 mismatch");
  if (!object.crc32c || !crc.validate(object.crc32c)) {
    throw new Error("Generation-bound recovery readback CRC32C mismatch");
  }
  if (String(bytes) !== object.size) throw new Error("Generation-bound recovery readback size mismatch");
  return { sha256: actualSha256, crc32c: object.crc32c, bytes };
}

export async function retainAndReadBackRecoveryDump({
  bucket,
  dumpPath,
  readbackPath,
  dumpSha256,
  sourceMajor,
  sourceRevision,
  currentSourceHash,
  snapshotEvidence,
  now = new Date(),
  uuid = randomUUID(),
  crcFactory,
}) {
  if (!/^[a-f0-9]{64}$/.test(dumpSha256) || !/^[a-f0-9]{64}$/.test(currentSourceHash)) {
    throw new Error("Recovery manifest hashes must be lowercase SHA-256 values");
  }
  if (!/^[a-f0-9]{40,64}$/.test(sourceRevision)) throw new Error("Recovery source revision is invalid");
  if (!Number.isSafeInteger(sourceMajor) || sourceMajor <= 0) throw new Error("Recovery source major is invalid");
  const local = await stat(dumpPath);
  const prefix = `private-database-recovery/${now.toISOString().replaceAll(/[:.]/g, "-")}-${uuid}`;
  const dumpObject = await uploadCreateOnly(bucket, dumpPath, `${prefix}/source.sql`, {
    purpose: "private-database-recovery",
    sha256: dumpSha256,
    sourceMajor: String(sourceMajor),
    sourceRevision,
    currentSourceHash,
  });
  let manifestObject;
  try {
    const manifest = {
      manifestVersion: 1,
      createdAt: now.toISOString(),
      sourceRevision,
      currentSourceHash,
      dump: { ...dumpObject, sha256: dumpSha256, sourceMajor, localBytes: local.size },
      consistentSnapshot: true,
      snapshotEvidence,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
    const manifestObjectName = `${prefix}/manifest.json`;
    const manifestFile = bucket.file(manifestObjectName);
    await manifestFile.save(manifestBytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      contentType: "application/json",
      metadata: { purpose: "private-database-recovery-manifest", sha256: manifestSha256 },
    });
    const [manifestMetadata] = await manifestFile.getMetadata();
    manifestObject = {
      name: manifestObjectName,
      generation: generationOf(manifestMetadata),
      crc32c: manifestMetadata.crc32c,
      size: String(manifestMetadata.size),
      sha256: manifestSha256,
    };
    const readback = await downloadAndVerify(
      bucket, dumpObject, readbackPath, dumpSha256, crcFactory,
    );
    return { prefix, dumpObject, manifestObject, readback };
  } catch (error) {
    if (error && typeof error === "object") {
      error.retainedArtifacts = { prefix, dumpObject, ...(manifestObject ? { manifestObject } : {}) };
    }
    throw error;
  }
}

export const recoveryPrivateStoreInternals = {
  DEFAULT_BUCKET_URL,
  REPLIT_ADC,
  downloadAndVerify,
};