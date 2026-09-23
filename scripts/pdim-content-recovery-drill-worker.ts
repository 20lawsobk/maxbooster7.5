import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const mode = process.argv[2];
const expected = process.env.PDIM_DRILL_EXPECTED
  ? JSON.parse(process.env.PDIM_DRILL_EXPECTED)
  : null;

const { startLocalPdimServer, stopLocalPdimServer } = await import(
  "../server/lib/localPdimServer.ts"
);
await startLocalPdimServer();

const { hybridStorageService: hybridStorage } = await import(
  "../server/services/hybridStorageService.ts"
);
const { pocketManager } = await import("../server/pocket-dimension/index.ts");

const owner = "synthetic-pdim-owner";
const stranger = "synthetic-pdim-stranger";
const fixtures = [
  {
    name: "recovery-tone.raw",
    mimeType: "audio/pcm",
    bytes: Buffer.from("RIFF\u0000synthetic-pocket-dimension-audio\u0001\u0002", "utf8"),
    metadata: { drill: "pdim-content-recovery", kind: "audio" },
  },
  {
    name: "cover-fragment.bin",
    mimeType: "application/octet-stream",
    bytes: Buffer.from([0x89, 0x50, 0x44, 0x49, 0x4d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
    metadata: { drill: "pdim-content-recovery", kind: "artwork" },
  },
];

function digest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function seed() {
  const content = [];
  for (const fixture of fixtures) {
    const uploaded = await hybridStorage.upload(
      owner,
      fixture.name,
      fixture.bytes,
      fixture.mimeType,
      { folder: "synthetic-recovery", metadata: fixture.metadata },
    );
    const metadata = hybridStorage.getMetadata(uploaded.key);
    assert(metadata);
    assert.equal(metadata.userId, owner);
    assert.equal(metadata.location, "pocket-dimension");
    assert.equal(metadata.tier, "cold");
    assert.deepEqual(metadata.metadata, fixture.metadata);
    assert.equal(digest(await hybridStorage.read(owner, uploaded.key)), digest(fixture.bytes));
    content.push({
      key: uploaded.key,
      owner,
      name: fixture.name,
      mimeType: fixture.mimeType,
      bytes: fixture.bytes.length,
      sha256: digest(fixture.bytes),
      metadata: fixture.metadata,
    });
  }
  await pocketManager.closeAll();
  process.stdout.write(`PDIM_DRILL_RESULT ${JSON.stringify({ content })}\n`);
}

async function verify() {
  assert(expected?.content?.length === fixtures.length);
  await hybridStorage.initialize();
  for (const item of expected.content) {
    const bytes = await hybridStorage.read(owner, item.key);
    assert.equal(bytes.length, item.bytes);
    assert.equal(digest(bytes), item.sha256);
    const metadata = hybridStorage.getMetadata(item.key);
    assert(metadata);
    assert.equal(metadata.userId, owner);
    assert.equal(metadata.originalName, item.name);
    assert.equal(metadata.mimeType, item.mimeType);
    assert.equal(metadata.location, "pocket-dimension");
    assert.deepEqual(metadata.metadata, item.metadata);
    await assert.rejects(
      hybridStorage.read(stranger, item.key),
      /Access denied/,
    );
  }
  assert.deepEqual(
    hybridStorage.listFiles(owner).map((entry) => entry.key).sort(),
    expected.content.map((item: { key: string }) => item.key).sort(),
  );
  assert.equal(hybridStorage.listFiles(stranger).length, 0);
  await pocketManager.closeAll();
  process.stdout.write(
    `PDIM_DRILL_RESULT ${JSON.stringify({
      verified: expected.content.length,
      ownershipIndexVerified: true,
      unauthorizedReadsRejected: true,
    })}\n`,
  );
}

if (mode === "seed") await seed();
else if (mode === "verify") await verify();
else throw new Error(`unknown PDIM drill worker mode: ${mode}`);

process.stdout.write("PDIM_DRILL_QUIESCED\n");
process.once("SIGTERM", () => {
  setImmediate(async () => {
    await stopLocalPdimServer();
    process.exit(0);
  });
});