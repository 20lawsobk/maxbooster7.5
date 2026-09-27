import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { build } from "esbuild";
import { assertLocalPdimSnapshotAuthority } from "../../server/lib/localPdimServer.js";
import { assertMatchingPdimRecoveryEvidence } from
  "../../server/services/backup/pdimRecoveryBackupService.js";

const evidence = {
  fileCount: 2,
  ownerCount: 1,
  physicalFileCount: 2,
  pocketEntryCount: 2,
  chunkCount: 2,
  fileContentEvidenceSha256: "a".repeat(64),
  ownershipCountsSha256: "b".repeat(64),
  everyFileReadByActualClasses: true as const,
};

const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
  if (!port) throw new Error("test could not reserve a local port");
  return port;
};

describe("retained PDIM operator recovery boundary", () => {
  it("protects creation with admin, 2FA, and explicit CSRF middleware", () => {
    const routeSource = readFileSync("server/routes/backup.ts", "utf8");
    expect(routeSource).toMatch(
      /router\.post\(\s*"\/pdim\/create",\s*requireAdmin,\s*requireVerified2FA,\s*csrfProtection,/,
    );
    expect(routeSource).toMatch(
      /"\/pdim\/jobs\/:jobId",\s*requireAdmin,\s*requireVerified2FA,\s*requireCsrfToken,/,
    );
    const csrfSource = readFileSync("server/middleware/csrf.ts", "utf8");
    expect(csrfSource).toMatch(
      /export const requireCsrfToken: RequestHandler = validateCsrfToken/,
    );
  });

  it("uses the shared fail-closed admin middleware for non-admins", () => {
    const authSource = readFileSync("server/middleware/auth.ts", "utf8");
    expect(authSource).toMatch(
      /if \(req\.user\.role === "admin"\)[\s\S]*res\.status\(403\)\.json\(\{ error: "Admin access required" \}\)/,
    );
    expect(authSource).toMatch(
      /requireVerified2FA[\s\S]*if \(!user\.twoFactorEnabled\)[\s\S]*requiresTwoFactor: true/,
    );
  });

  it("fails closed when runtime backend authority does not match", () => {
    const base = {
      expectedExecUrl: "http://127.0.0.1:5556/api/redis/instances/local/exec",
      serverListening: true,
      serverAddress: { address: "127.0.0.1", family: "IPv4", port: 5556 },
      sourcePath: "/workspace/data/local-pdim-store.json",
      expectedSourcePath: "/workspace/data/local-pdim-store.json",
    };
    expect(() => assertLocalPdimSnapshotAuthority({
      ...base,
      configuredExecUrl: base.expectedExecUrl,
    })).not.toThrow();
    expect(() => assertLocalPdimSnapshotAuthority({
      ...base,
      configuredExecUrl: "https://remote.example/api/exec",
    })).toThrow(/authority mismatch/);
    expect(() => assertLocalPdimSnapshotAuthority({
      ...base,
      configuredExecUrl: base.expectedExecUrl,
      serverListening: false,
    })).toThrow(/authority mismatch/);
    expect(() => assertLocalPdimSnapshotAuthority({
      ...base,
      configuredExecUrl: base.expectedExecUrl,
      sourcePath: "/workspace/other/local-pdim-store.json",
    })).toThrow(/authority mismatch/);
  });

  it("rejects corruption or generation readback evidence drift", () => {
    expect(() => assertMatchingPdimRecoveryEvidence(evidence, evidence)).not.toThrow();
    expect(() => assertMatchingPdimRecoveryEvidence(evidence, {
      ...evidence,
      fileContentEvidenceSha256: "c".repeat(64),
    })).toThrow(/evidence mismatch/);
    expect(() => assertMatchingPdimRecoveryEvidence(evidence, {
      ...evidence,
      ownershipCountsSha256: "d".repeat(64),
    })).toThrow(/evidence mismatch/);
  });

  it("executes the standalone production worker with bundled imports", async () => {
    const root = process.cwd();
    const scratch = await mkdtemp(join(root, ".pdim-worker-packaging-test-"));
    try {
      const worker = join(scratch, "retained-pdim-recovery-worker.mjs");
      await build({
        entryPoints: [join(root, "scripts/retained-pdim-recovery-worker.ts")],
        bundle: true,
        platform: "node",
        target: "node22",
        format: "esm",
        outfile: worker,
        packages: "external",
        logLevel: "silent",
      });
      const bundledSource = readFileSync(worker, "utf8");
      expect(bundledSource).not.toContain("tsx/dist/loader.mjs");

      await mkdir(join(scratch, "data"), { mode: 0o700 });
      await writeFile(join(scratch, "data/local-pdim-store.json"), "{}\n", {
        mode: 0o600,
      });
      const port = await freePort();
      const child = spawn(process.execPath, [worker], {
        cwd: scratch,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: "/tmp",
          NODE_ENV: "test",
          LOCAL_PDIM_PORT: String(port),
          PDIM_EXEC_URL:
            `http://127.0.0.1:${port}/api/redis/instances/local/exec`,
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr += chunk; });
      const code = await new Promise<number | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("standalone worker packaging regression timed out"));
        }, 30_000);
        child.once("close", value => {
          clearTimeout(timeout);
          resolve(value);
        });
      });
      expect(code).toBe(1);
      expect(stderr).toContain("Retained PDIM isolated verification failed");
      expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 40_000);

  it("makes the standalone worker a required production artifact", () => {
    const buildSource = readFileSync("script/build.ts", "utf8");
    const legacyBuildSource = readFileSync("build.sh", "utf8");
    const dockerignore = readFileSync(".dockerignore", "utf8");
    const serviceSource = readFileSync(
      "server/services/backup/pdimRecoveryBackupService.ts",
      "utf8",
    );
    expect(buildSource).toContain(
      'outfile: path.resolve(root, "dist/retained-pdim-recovery-worker.mjs")',
    );
    expect(buildSource).toContain(
      'const requiredPdimWorker = "dist/retained-pdim-recovery-worker.mjs"',
    );
    expect(legacyBuildSource).toContain("export DEPLOY_PACK=1");
    expect(legacyBuildSource).toContain("exec npm run build");
    expect(buildSource).toContain('if (!remainingMembers.includes(requiredPdimWorker))');
    expect(buildSource).toContain("Required runtime artifact is absent from the app capsule payload:");
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts.build).toContain("script/build.ts");
    expect(dockerignore).toContain("!scripts/retained-pdim-recovery-worker.ts");
    expect(dockerignore).toContain("!scripts/recovery-private-store.mjs");
    expect(serviceSource).toMatch(
      /production\s*\?\s*join\(workspace, "dist\/retained-pdim-recovery-worker\.mjs"\)/,
    );
    expect(serviceSource).toMatch(
      /import \{[\s\S]*retainAndReadBackPdimSnapshot[\s\S]*\} from "\.\.\/\.\.\/\.\.\/scripts\/recovery-private-store\.mjs"/,
    );
  });
});