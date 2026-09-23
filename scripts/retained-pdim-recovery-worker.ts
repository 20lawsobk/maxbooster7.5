import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const digest = (parts: string[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
};

const { startLocalPdimServer, stopLocalPdimServer } = await import(
  "../server/lib/localPdimServer.ts"
);

try {
  await startLocalPdimServer();
  const { hybridStorageService } = await import(
    "../server/services/hybridStorageService.ts"
  );
  const { pocketManager } = await import("../server/pocket-dimension/index.ts");
  const { getPdimClient } = await import("../server/lib/pdimClient.ts");

  await hybridStorageService.initialize();
  const raw = await getPdimClient().get("hybrid:storage:index");
  assert.notEqual(raw, null, "hybrid ownership index is absent");
  const index = JSON.parse(raw!);
  assert(index && typeof index === "object" && !Array.isArray(index));
  const files = Object.values(index.files ?? {}) as Array<Record<string, unknown>>;
  assert(files.length > 0, "hybrid ownership index contains no persisted files");

  const owners = new Map<string, number>();
  const fileEvidence: string[] = [];
  for (const file of files.sort((left, right) =>
    String(left.key).localeCompare(String(right.key)))) {
    const key = String(file.key);
    const owner = String(file.userId);
    assert(key.length > 0 && owner.length > 0);
    const bytes = await hybridStorageService.read(owner, key);
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(contentSha256, file.contentHash);
    assert.equal(bytes.length, file.sizeBytes);
    const metadata = hybridStorageService.getMetadata(key);
    assert(metadata);
    assert.equal(metadata.userId, owner);
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    fileEvidence.push(`${key}\0${owner}\0${contentSha256}\0${bytes.length}`);
  }

  const ownershipEvidence: string[] = [];
  for (const [owner, count] of [...owners].sort(([left], [right]) =>
    left.localeCompare(right))) {
    assert.equal(hybridStorageService.listFiles(owner).length, count);
    ownershipEvidence.push(`${owner}\0${count}`);
  }

  const pocket = await pocketManager.openPocket("hybrid-cold-storage");
  const pocketEntries = await pocket.list("storage/");
  const physicalFiles = files.filter(file => file.isDeduplicated !== true);
  assert.equal(pocketEntries.length, physicalFiles.length);
  const stats = pocket.getStats();
  assert(stats.chunkCount > 0);

  const result = {
    fileCount: files.length,
    ownerCount: owners.size,
    physicalFileCount: physicalFiles.length,
    pocketEntryCount: pocketEntries.length,
    chunkCount: stats.chunkCount,
    fileContentEvidenceSha256: digest(fileEvidence),
    ownershipCountsSha256: digest(ownershipEvidence),
    everyFileReadByActualClasses: true,
  };
  await pocketManager.closeAll();
  await stopLocalPdimServer();
  process.stdout.write(`RETAINED_PDIM_RESULT ${JSON.stringify(result)}\n`);
} catch (error) {
  await stopLocalPdimServer().catch(() => {});
  process.stderr.write("Retained PDIM isolated verification failed\n");
  process.exitCode = 1;
}