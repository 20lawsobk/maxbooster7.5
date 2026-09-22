import { spawn as nodeSpawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import {
  dumpedServerMajor,
  dumpedServerVersion,
  safePostgresDiagnostic,
  selectPgDumpForServer,
  type PostgresToolSelection,
} from "./postgresTools.js";

const DUMP_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
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
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_UNCOMMITTED_DUMP_BYTES) {
    throw new Error("Invalid uncommitted database dump byte limit");
  }

  const selection = await selectTool(sourceUrl);
  const tmpPath = path.join(
    dependencies.tmpDirectory ?? "/tmp",
    `uncommitted-pg-dump-${randomUUID()}.sql`,
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const pgDump = spawn(selection.tool.path, ["--no-owner", "--no-acl"], {
        env: { ...process.env, PGDATABASE: sourceUrl },
        timeout: DUMP_TIMEOUT_MS,
      });
      const writeStream = createWriteStream(tmpPath, { mode: 0o600, flags: "wx" });
      let errorOutput = "";
      let diagnosticBytes = 0;
      let dumpBytes = 0;
      let pipelineDone = false;
      let exited = false;
      let exitCode: number | null = null;
      let settled = false;

      function fail(error: Error) {
        if (settled) return;
        settled = true;
        writeStream.destroy();
        pgDump.kill();
        reject(error);
      }

      pgDump.stderr?.on("data", chunk => {
        const text = chunk.toString();
        diagnosticBytes += Buffer.byteLength(text);
        if (diagnosticBytes > MAX_DIAGNOSTIC_BYTES) {
          fail(new Error("pg_dump exceeded diagnostic output limit"));
          return;
        }
        errorOutput += text;
      });
      writeStream.on("finish", () => {
        pipelineDone = true;
        check();
      });
      writeStream.on("error", fail);
      pgDump.stdout?.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE" && error.code !== "ECONNRESET") fail(error);
      });
      if (!pgDump.stdout) {
        fail(new Error("pg_dump did not provide a stdout stream"));
        return;
      }
      pgDump.stdout.on("data", chunk => {
        dumpBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
        if (dumpBytes > maxBytes) {
          fail(new Error(
            `Uncommitted database dump exceeds the ${maxBytes} byte generation limit`,
          ));
        }
      });
      pgDump.stdout.pipe(writeStream);
      pgDump.on("close", code => {
        exited = true;
        exitCode = code;
        check();
      });
      pgDump.on("error", fail);

      function check() {
        if (settled || !pipelineDone || !exited) return;
        if (exitCode === 0) {
          settled = true;
          resolve();
        } else {
          fail(new Error(
            `pg_dump failed (code ${exitCode}): ${safePostgresDiagnostic(errorOutput)}`,
          ));
        }
      }
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
    return {
      bytes,
      checksum: databaseDumpChecksum(bytes),
      size: bytes.length,
      sourceMajor,
      sourceVersion,
      durability: "uncommitted",
    };
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}