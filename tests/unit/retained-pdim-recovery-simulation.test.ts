// Pre-deployment simulation only. App Storage is represented by a generation-
// enforcing in-memory SDK boundary; PDIM/HybridStorage consumers are real.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { Readable } from "node:stream";
import { build } from "esbuild";
import { CRC32C } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { retainAndReadBackPdimSnapshot } from
  "../../scripts/recovery-private-store.mjs";

const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  if (!port) throw new Error("could not reserve simulation port");
  return port;
};

async function runWorker(
  worker: string,
  root: string,
  expectedMarker: string,
) {
  const port = await freePort();
  const child = spawn(process.execPath, [
    "--max-old-space-size=192",
    worker,
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: "/tmp",
      NODE_ENV: "test",
      LOCAL_PDIM_PORT: String(port),
      PDIM_EXEC_URL:
        `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(
        `retained PDIM simulation worker timed out (${expectedMarker}); ` +
        `stdout=${stdout.slice(-5_000)}; stderr=${stderr.slice(-5_000)}`,
      ));
    }, 120_000);
    child.once("close", value => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  if (code !== 0 || !stdout.includes(expectedMarker)) {
    throw new Error(`simulation worker failed: ${stderr}`);
  }
  const resultLine = stdout.split("\n").find(line =>
    line.startsWith("RETAINED_PDIM_RESULT "));
  return resultLine
    ? JSON.parse(resultLine.slice("RETAINED_PDIM_RESULT ".length))
    : null;
}

const crc32c = (bytes: Buffer) => {
  const crc = new CRC32C();
  crc.update(bytes);
  return crc.toString();
};

function simulatedGenerationStorage({ corruptSnapshotRead = false } = {}) {
  const objects = new Map<string, {
    bytes: Buffer;
    metadata: Record<string, string>;
  }>();
  const generationReads: Array<{ name: string; generation: string }> = [];
  let generation = 700;
  const put = (name: string, bytes: Buffer) => {
    const metadata = {
      generation: String(++generation),
      crc32c: crc32c(bytes),
      size: String(bytes.length),
    };
    objects.set(name, { bytes, metadata });
    return metadata;
  };
  const file = (name: string, options: { generation?: string } = {}) => ({
    async save(bytes: Buffer, saveOptions: any) {
      expect(saveOptions.preconditionOpts.ifGenerationMatch).toBe(0);
      expect(objects.has(name)).toBe(false);
      put(name, Buffer.from(bytes));
    },
    async getMetadata() {
      return [objects.get(name)!.metadata];
    },
    createReadStream(readOptions: any) {
      expect(readOptions.validation).toBe("crc32c");
      const stored = objects.get(name)!;
      expect(options.generation).toBe(stored.metadata.generation);
      generationReads.push({ name, generation: options.generation! });
      const bytes = corruptSnapshotRead && name.endsWith("local-pdim-store.json")
        ? Buffer.concat([stored.bytes, Buffer.from("corrupt")])
        : stored.bytes;
      return Readable.from(bytes);
    },
  });
  return {
    bucket: {
      async upload(localPath: string, options: any) {
        expect(options.preconditionOpts.ifGenerationMatch).toBe(0);
        const bytes = await readFile(localPath);
        put(options.destination, bytes);
        return [file(options.destination)];
      },
      file,
    },
    generationReads,
  };
}

describe("retained PDIM pre-deployment recovery simulation", () => {
  it("retains an exact generation and restores it through independent real consumers", async () => {
    const workspace = process.cwd();
    const scratch = await mkdtemp(join(workspace, ".pdim-recovery-simulation-"));
    try {
      const fixtureWorker = join(scratch, "fixture-worker.mjs");
      const verifierWorker = join(scratch, "verifier-worker.mjs");
      await Promise.all([
        build({
          entryPoints: [
            join(workspace, "tests/fixtures/retained-pdim-source-fixture-worker.ts"),
          ],
          bundle: true,
          platform: "node",
          target: "node22",
          format: "esm",
          outfile: fixtureWorker,
          packages: "external",
          logLevel: "silent",
        }),
        build({
          entryPoints: [
            join(workspace, "scripts/retained-pdim-recovery-worker.ts"),
          ],
          bundle: true,
          platform: "node",
          target: "node22",
          format: "esm",
          outfile: verifierWorker,
          packages: "external",
          logLevel: "silent",
        }),
      ]);

      const sourceRoot = join(scratch, "source");
      await mkdir(join(sourceRoot, "data"), { recursive: true, mode: 0o700 });
      await runWorker(
        fixtureWorker,
        sourceRoot,
        "RETAINED_PDIM_FIXTURE_READY",
      );
      const sourceEvidence = await runWorker(
        verifierWorker,
        sourceRoot,
        "RETAINED_PDIM_RESULT ",
      );
      expect(sourceEvidence).toMatchObject({
        fileCount: 3,
        ownerCount: 2,
        physicalFileCount: 2,
        everyFileReadByActualClasses: true,
      });

      const snapshotPath = join(sourceRoot, "data/local-pdim-store.json");
      const snapshotBytes = await readFile(snapshotPath);
      const snapshotSha256 = createHash("sha256")
        .update(snapshotBytes)
        .digest("hex");
      const readbackPath = join(scratch, "generation-readback.json");
      const simulated = simulatedGenerationStorage();
      const retained = await retainAndReadBackPdimSnapshot({
        bucket: simulated.bucket,
        snapshotPath,
        readbackPath,
        snapshotSha256,
        sourceRevision: "a".repeat(40),
        currentSourceHash: "b".repeat(64),
        snapshotEvidence: sourceEvidence,
        now: new Date("2026-01-02T03:04:05.000Z"),
        uuid: "predeploy-simulation",
      });
      expect(await readFile(readbackPath)).toEqual(snapshotBytes);
      expect(simulated.generationReads).toContainEqual({
        name: retained.snapshotObject.name,
        generation: retained.snapshotObject.generation,
      });

      const restoredRoot = join(scratch, "restored");
      await mkdir(join(restoredRoot, "data"), {
        recursive: true,
        mode: 0o700,
      });
      await copyFile(
        readbackPath,
        join(restoredRoot, "data/local-pdim-store.json"),
      );
      await chmod(
        join(restoredRoot, "data/local-pdim-store.json"),
        0o600,
      );
      const restoredEvidence = await runWorker(
        verifierWorker,
        restoredRoot,
        "RETAINED_PDIM_RESULT ",
      );
      expect(restoredEvidence).toEqual(sourceEvidence);

      const corruptReadback = join(scratch, "corrupt-readback.json");
      const corruptStorage = simulatedGenerationStorage({
        corruptSnapshotRead: true,
      });
      await expect(retainAndReadBackPdimSnapshot({
        bucket: corruptStorage.bucket,
        snapshotPath,
        readbackPath: corruptReadback,
        snapshotSha256,
        sourceRevision: "a".repeat(40),
        currentSourceHash: "b".repeat(64),
        snapshotEvidence: sourceEvidence,
        now: new Date("2026-01-02T03:04:06.000Z"),
        uuid: "predeploy-corruption-simulation",
      })).rejects.toThrow(/SHA-256 mismatch/);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 120_000);
});