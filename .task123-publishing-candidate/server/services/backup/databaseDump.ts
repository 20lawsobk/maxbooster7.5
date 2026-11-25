import { spawn as nodeSpawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import {
  dumpedServerMajor,
  dumpedServerVersion,
  postgresConnectionEnvironment,
  safePostgresDiagnostic,
  selectPgDumpForServer,
  type PostgresToolSelection,
} from "./postgresTools.js";
import { restrictedChildEnvironment } from "../subprocessSafety.js";

const DUMP_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
const TERMINATION_GRACE_MS = 2_000;
export const MAX_UNCOMMITTED_DUMP_BYTES = 1024 * 1024 * 1024;

type SpawnLike = typeof nodeSpawn;

export interface UncommittedDatabaseDump {
  bytes: Buffer;
  checksum: string;
  size: number;
  sourceMajor: number;
  sourceVersion: string;
  durability: "uncommitted";
}

export interface DatabaseDumpDependencies {
  spawn?: SpawnLike;
  selectTool?: (databaseUrl: string) => Promise<PostgresToolSelection>;
  createWriteStream?: typeof fs.createWriteStream;
  stat?: typeof fsPromises.stat;
  readFile?: typeof fsPromises.readFile;
  unlink?: typeof fsPromises.unlink;
  tmpDirectory?: string;
  maxBytes?: number;
  terminationGraceMs?: number;
  /** PostgreSQL snapshot exported by a caller-held read-only transaction. */
  snapshotId?: string;
}

export function databaseDumpChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generates dump bytes only. The result is deliberately marked uncommitted:
 * callers must independently persist, read back, and restore-verify it before
 * describing it as durable or verified.
 */
export async function generateUncommittedDatabaseDump(
  sourceUrl: string,
  dependencies: DatabaseDumpDependencies = {},
): Promise<UncommittedDatabaseDump> {
  const selectTool = dependencies.selectTool ?? selectPgDumpForServer;
  const spawn = dependencies.spawn ?? nodeSpawn;
  const createWriteStream = dependencies.createWriteStream ?? fs.createWriteStream;
  const stat = dependencies.stat ?? fsPromises.stat;
  const readFile = dependencies.readFile ?? fsPromises.readFile;
  const unlink = dependencies.unlink ?? fsPromises.unlink;
  const maxBytes = dependencies.maxBytes ?? MAX_UNCOMMITTED_DUMP_BYTES;
  const terminationGraceMs = dependencies.terminationGraceMs ?? TERMINATION_GRACE_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_UNCOMMITTED_DUMP_BYTES) {
    throw new Error("Invalid uncommitted database dump byte limit");
  }
  if (!Number.isSafeInteger(terminationGraceMs) || terminationGraceMs <= 0 || terminationGraceMs > 10_000) {
    throw new Error("Invalid pg_dump termination grace period");
  }
  if (
    dependencies.snapshotId !== undefined &&
    !/^[0-9A-Fa-f]+(?:-[0-9A-Fa-f]+)+$/.test(dependencies.snapshotId)
  ) {
    throw new Error("Invalid exported PostgreSQL snapshot identifier");
  }

  const selection = await selectTool(sourceUrl);
  const tmpPath = path.join(
    dependencies.tmpDirectory ?? "/tmp",
    `uncommitted-pg-dump-${randomUUID()}.sql`,
  );

  let result: UncommittedDatabaseDump | undefined;
  let primaryError: unknown;
  try {
    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(tmpPath, { mode: 0o600, flags: "wx" });
      let pgDump: ReturnType<SpawnLike> | undefined;
      let errorOutput = "";
      let diagnosticBytes = 0;
      let dumpBytes = 0;
      let streamFinished = false;
      let streamClosed = false;
      let childClosed = false;
      let terminationExhausted = false;
      let exitCode: number | null = null;
      let settled = false;
      let failure: Error | undefined;
      let termTimer: ReturnType<typeof setTimeout> | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      function clearTerminationTimers() {
        if (termTimer) clearTimeout(termTimer);
        if (killTimer) clearTimeout(killTimer);
        termTimer = undefined;
        killTimer = undefined;
      }

      function check() {
        if (settled) return;
        if (!failure) {
          if (!streamClosed || !childClosed) return;
          if (!streamFinished) {
            beginFailure(new Error("pg_dump output stream closed before finishing"));
            return;
          }
          if (exitCode !== 0) {
            beginFailure(new Error(
              `pg_dump failed (code ${exitCode}): ${safePostgresDiagnostic(errorOutput)}`,
            ));
            return;
          }
          settled = true;
          clearTerminationTimers();
          resolve();
          return;
        }
        if (!streamClosed || (!childClosed && !terminationExhausted)) return;
        settled = true;
        clearTerminationTimers();
        reject(failure);
      }

      function terminateChild() {
        if (!pgDump || childClosed) return;
        try {
          pgDump.kill("SIGTERM");
        } catch {
          // Escalation below still attempts SIGKILL.
        }
        termTimer = setTimeout(() => {
          if (childClosed || !pgDump) return;
          try {
            pgDump.kill("SIGKILL");
          } catch {
            // The bounded close deadline below reports unconfirmed teardown.
          }
          killTimer = setTimeout(() => {
            if (childClosed) return;
            terminationExhausted = true;
            const teardown = new Error("pg_dump did not close after SIGTERM/SIGKILL");
            failure = new AggregateError(
              failure ? [failure, teardown] : [teardown],
              `${failure?.message ?? "pg_dump failed"}; child termination was not confirmed`,
            );
            check();
          }, terminationGraceMs);
        }, terminationGraceMs);
      }

      function beginFailure(error: Error) {
        if (!failure) failure = error;
        if (!streamClosed) writeStream.destroy();
        terminateChild();
        check();
      }

      writeStream.on("finish", () => {
        streamFinished = true;
      });
      writeStream.on("close", () => {
        streamClosed = true;
        if (!streamFinished && !failure) {
          beginFailure(new Error("pg_dump output stream closed before finishing"));
          return;
        }
        check();
      });
      writeStream.on("error", beginFailure);

      try {
        const args = [
          "--no-owner",
          "--no-acl",
          ...(dependencies.snapshotId ? [`--snapshot=${dependencies.snapshotId}`] : []),
        ];
        pgDump = spawn(selection.tool.path, args, {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: restrictedChildEnvironment(postgresConnectionEnvironment(sourceUrl)),
          timeout: DUMP_TIMEOUT_MS,
        });
      } catch (error) {
        childClosed = true;
        beginFailure(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      pgDump.stderr?.on("data", chunk => {
        const text = chunk.toString();
        diagnosticBytes += Buffer.byteLength(text);
        if (diagnosticBytes > MAX_DIAGNOSTIC_BYTES) {
          beginFailure(new Error("pg_dump exceeded diagnostic output limit"));
          return;
        }
        errorOutput += text;
      });
      pgDump.stdout?.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE" && error.code !== "ECONNRESET") beginFailure(error);
      });
      if (!pgDump.stdout) {
        beginFailure(new Error("pg_dump did not provide a stdout stream"));
        return;
      }
      pgDump.stdout.on("data", chunk => {
        dumpBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
        if (dumpBytes > maxBytes) {
          beginFailure(new Error(
            `Uncommitted database dump exceeds the ${maxBytes} byte generation limit`,
          ));
        }
      });
      pgDump.stdout.pipe(writeStream);
      pgDump.on("close", code => {
        childClosed = true;
        exitCode = code;
        clearTerminationTimers();
        if (code !== 0 && !failure) {
          beginFailure(new Error(
            `pg_dump failed (code ${code}): ${safePostgresDiagnostic(errorOutput)}`,
          ));
          return;
        }
        check();
      });
      pgDump.on("error", error => beginFailure(error));
    });

    const stats = await stat(tmpPath);
    if (stats.size > maxBytes) {
      throw new Error(
        `Uncommitted database dump is ${stats.size} bytes and exceeds the ${maxBytes} byte read limit`,
      );
    }
    const bytes = await readFile(tmpPath);
    if (bytes.length !== stats.size) {
      throw new Error("Uncommitted database dump changed while being read");
    }
    const sourceMajor = dumpedServerMajor(bytes);
    const sourceVersion = dumpedServerVersion(bytes);
    if (sourceMajor !== selection.serverMajor) {
      throw new Error(
        `pg_dump source major ${sourceMajor} did not match queried server major ${selection.serverMajor}`,
      );
    }
    result = {
      bytes,
      checksum: databaseDumpChecksum(bytes),
      size: bytes.length,
      sourceMajor,
      sourceVersion,
      durability: "uncommitted",
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError: unknown;
  try {
    await unlink(tmpPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `${primaryError instanceof Error ? primaryError.message : String(primaryError)}; ` +
        `temporary dump cleanup failed: ${safePostgresDiagnostic(cleanupError)}`,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) {
    throw new Error(
      `Temporary database dump cleanup failed: ${safePostgresDiagnostic(cleanupError)}`,
      { cause: cleanupError },
    );
  }
  return result!;
}