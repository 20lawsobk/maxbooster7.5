import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("real workers and capsule verification complete and let the CLI exit naturally", async () => {
  const code = `
    const { default: assert } = await import('node:assert/strict');
    const { parallelBlockCompressor: pool } = await import('./server/pocket-dimension/fabric/compression/ParallelBlockCompressor.ts');
    const input = Buffer.from('deployment source content\\n'.repeat(12000));
    for (let round = 0; round < 2; round++) {
      const { blocks } = await pool.compressBlocks(input);
      assert.deepEqual(await pool.decompressBlocks(blocks), input);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await assert.rejects(pool.decompressBlocks([Buffer.from('invalid brotli')]));
    const { blocks } = await pool.compressBlocks(input);
    assert.deepEqual(await pool.decompressBlocks(blocks), input);
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { adaptiveCapsuleCodec } = await import('./script/lib/adaptiveCapsuleCodec.ts');
    const { PlatformCapsuleBuilder, PlatformCapsuleLoader } =
      await import('./external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.ts');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-natural-exit-'));
    try {
      const source = path.join(root, 'source'), storagePath = path.join(root, 'storage');
      await fs.mkdir(source);
      await fs.writeFile(path.join(source, 'sample.txt'), input);
      const metadata = await new PlatformCapsuleBuilder(source).build({
        version: 'exit-regression', platformName: 'isolated fixture', encrypt: false,
        entryPoint: 'sample.txt', startCommand: 'not executed',
        storagePath, compressionCodec: adaptiveCapsuleCodec,
      });
      const loader = new PlatformCapsuleLoader();
      await loader.load(metadata.id, storagePath, adaptiveCapsuleCodec);
      assert.equal(await loader.verify(), true);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
    console.log('VERIFIED_WORK_COMPLETE');
  `;
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ["--import", "tsx", "-e", `(async () => {${code}})().catch(error => { console.error(error); process.exitCode = 1; });`], {
      env: { ...process.env, DEPLOY_TASK_CPU: "2" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", timedOut = false;
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 20000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output, timedOut });
    });
  });
  assert.match(result.output, /VERIFIED_WORK_COMPLETE/, result.output);
  assert.equal(result.timedOut, false, `CLI hung after completing verification:\n${result.output}`);
  assert.equal(result.code, 0, result.output);
});
