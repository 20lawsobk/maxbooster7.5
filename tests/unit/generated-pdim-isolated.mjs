// Explicit isolated storage smoke test; no application, DB, or production store.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes, createHash } from "node:crypto";

const temp = await mkdtemp(join(tmpdir(), "generated-pdim-"));
const original = process.cwd();
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
process.chdir(temp);
Object.assign(process.env, {
  NODE_ENV: "test", LOCAL_PDIM_PORT: String(port),
  PDIM_EXEC_URL: `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
  PDIM_LOCAL_CHANNEL_TOKEN: randomBytes(32).toString("hex"),
});
process.env.PDIM_EXEC_TOKEN = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
let stop;
try {
  const local = await import("../../server/lib/localPdimServer.ts");
  stop = local.stopLocalPdimServer;
  await local.startLocalPdimServer();
  const { pocketManager } = await import("../../server/pocket-dimension/index.ts");
  const { validateGeneratedArtifact } = await import("../../server/services/generatedArtifactValidation.ts");
  const bytes = Buffer.alloc(16044);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(16000, 40);
  assert.equal((await validateGeneratedArtifact(bytes, "audio")).duration, 1);
  const pocket = await pocketManager.openPocket("isolated-generated-artifact");
  const key = "files/users/test-owner/generated/test-job/audio.wav";
  await pocket.write(key, bytes);
  const retrieved = await pocket.read(key);
  assert.equal(createHash("sha256").update(retrieved).digest("hex"),
    createHash("sha256").update(bytes).digest("hex"));
  await pocketManager.closeAll();
  console.log("PASS: actual WAV validation -> isolated private PDIM write/read -> SHA-256 equality");
} finally {
  if (stop) await stop();
  process.chdir(original);
  await rm(temp, { recursive: true, force: true });
}
process.exit(0);