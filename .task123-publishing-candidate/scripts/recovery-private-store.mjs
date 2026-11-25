import { createReadStream, createWriteStream } from "node:fs";
import { chmod, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

export const MANAGED_STORAGE_CONTRACT = Object.freeze({
  privacy: "private Replit App Storage; authenticated access required",
  retention: "retained-until-explicit-delete",
  fixedDurationLocked: false,
});

const collect = async stream => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export async function verifyManagedPrivateStorage({
  bucket,
  bucketId,
  fetchImpl = globalThis.fetch,
  uuid = randomUUID(),
  canaryBytes = randomBytes(32),
}) {
  if (!bucket || typeof bucket.file !== "function") throw new Error("Managed recovery bucket is unavailable");
  assertSafeBucketId(bucketId);
  if (typeof fetchImpl !== "function") throw new Error("Anonymous privacy probe is unavailable");
  if (!Buffer.isBuffer(canaryBytes) || canaryBytes.length < 16) {
    throw new Error("Privacy canary must contain at least 16 random non-sensitive bytes");
  }

  const name = `private-database-recovery/privacy-canary-${uuid}`;
  const writable = bucket.file(name);
  await writable.save(canaryBytes, {
    resumable: false,
    validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    contentType: "application/octet-stream",
    metadata: { purpose: "non-sensitive-private-storage-canary" },
  });
  const [metadata] = await writable.getMetadata();
  const generation = generationOf(metadata);
  const pinned = bucket.file(name, { generation });
  let probeAttempted = false;
  let primaryError;
  let anonymousStatus;
  try {
    try {
      const authenticated = await collect(pinned.createReadStream({ validation: "crc32c" }));
      if (!authenticated.equals(canaryBytes)) {
        throw new Error("Authenticated privacy-canary readback mismatch");
      }
    } catch (error) {
      primaryError = error;
    }

    try {
      const objectPath = name.split("/").map(encodeURIComponent).join("/");
      const url = `https://storage.googleapis.com/${bucketId}/${objectPath}?generation=${generation}`;
      probeAttempted = true;
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
      });
      anonymousStatus = response.status;
      if (response.redirected === true || ![403, 404].includes(response.status)) {
        throw new Error(`Anonymous privacy probe returned unexpected status ${response.status}`);
      }
    } catch (error) {
      primaryError ??= error;
    }
  } finally {
    if (probeAttempted) {
      try {
        await pinned.delete({ preconditionOpts: { ifGenerationMatch: generation } });
      } catch (cleanupError) {
        primaryError ??= new Error(`Privacy canary cleanup failed: ${cleanupError?.message ?? cleanupError}`);
      }
    }
  }
  if (!probeAttempted) {
    throw primaryError ?? new Error("Anonymous privacy probe was not attempted; canary was not removed");
  }
  if (primaryError) throw primaryError;
  return {
    ...MANAGED_STORAGE_CONTRACT,
    privacyProbe: "authenticated generation-bound read matched; anonymous exact-object fetch denied",
    anonymousStatus,
    canaryRemoved: true,
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
      storageContract: MANAGED_STORAGE_CONTRACT,
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

export async function retainAndReadBackPdimSnapshot({
  bucket,
  snapshotPath,
  readbackPath,
  snapshotSha256,
  sourceRevision,
  currentSourceHash,
  snapshotEvidence,
  now = new Date(),
  uuid = randomUUID(),
  crcFactory,
}) {
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256) || !/^[a-f0-9]{64}$/.test(currentSourceHash)) {
    throw new Error("PDIM recovery manifest hashes must be lowercase SHA-256 values");
  }
  if (!/^[a-f0-9]{40,64}$/.test(sourceRevision)) {
    throw new Error("PDIM recovery source revision is invalid");
  }
  const local = await stat(snapshotPath);
  const prefix = `private-pdim-recovery/${now.toISOString().replaceAll(/[:.]/g, "-")}-${uuid}`;
  const snapshotObject = await uploadCreateOnly(
    bucket,
    snapshotPath,
    `${prefix}/local-pdim-store.json`,
    {
      purpose: "private-pdim-recovery",
      sha256: snapshotSha256,
      sourceRevision,
      currentSourceHash,
    },
  );
  let manifestObject;
  try {
    const manifest = {
      manifestVersion: 1,
      createdAt: now.toISOString(),
      sourceRevision,
      currentSourceHash,
      storageContract: MANAGED_STORAGE_CONTRACT,
      snapshot: {
        ...snapshotObject,
        sha256: snapshotSha256,
        localBytes: local.size,
      },
      consistentStoppedSourceSnapshot: true,
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
      metadata: { purpose: "private-pdim-recovery-manifest", sha256: manifestSha256 },
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
      bucket,
      snapshotObject,
      readbackPath,
      snapshotSha256,
      crcFactory,
    );
    return { prefix, snapshotObject, manifestObject, readback };
  } catch (error) {
    if (error && typeof error === "object") {
      error.retainedArtifacts = {
        prefix,
        snapshotObject,
        ...(manifestObject ? { manifestObject } : {}),
      };
    }
    throw error;
  }
}

export const recoveryPrivateStoreInternals = {
  DEFAULT_BUCKET_URL,
  REPLIT_ADC,
  downloadAndVerify,
};