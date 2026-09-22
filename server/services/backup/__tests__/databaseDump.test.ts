import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  databaseDumpChecksum,
  generateUncommittedDatabaseDump,
} from "../databaseDump.js";

const temporaryDirectories: string[] = [];
const validDump = Buffer.from(
  "-- PostgreSQL database dump\n-- Dumped from database version 17.11\nSELECT 1;\n",
);

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "database-dump-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function spawnWith(output: Buffer, exitCode = 0, stderr = "") {
  return vi.fn((command: string, args: string[], options: unknown) => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    setImmediate(() => {
      child.stdout.end(output);
      child.stderr.end(stderr);
      child.emit("close", exitCode);
    });
    return child;
  });
}

function selector(serverMajor = 17) {
  return vi.fn(async () => ({
    tool: { path: "/synthetic/postgresql-17/bin/pg_dump", major: 17, version: "17.5" },
    serverMajor,
    probes: [],
  }));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("uncommitted database dump generation", () => {
  it("uses the selected tool and returns explicitly uncommitted source evidence", async () => {
    const directory = await temporaryDirectory();
    const spawn = spawnWith(validDump);
    const selectTool = selector();
    const sourceUrl = "postgresql://operator:secret@source.invalid/catalog";

    const dump = await generateUncommittedDatabaseDump(sourceUrl, {
      tmpDirectory: directory,
      spawn: spawn as any,
      selectTool,
    });

    expect(selectTool).toHaveBeenCalledWith(sourceUrl);
    expect(spawn).toHaveBeenCalledWith(
      "/synthetic/postgresql-17/bin/pg_dump",
      ["--no-owner", "--no-acl"],
      expect.objectContaining({
        timeout: 45 * 60 * 1000,
        env: expect.objectContaining({ PGDATABASE: sourceUrl }),
      }),
    );
    expect(dump).toEqual({
      bytes: validDump,
      checksum: databaseDumpChecksum(validDump),
      size: validDump.length,
      sourceMajor: 17,
      sourceVersion: "17.11",
      durability: "uncommitted",
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it("removes the temporary file after pg_dump failure", async () => {
    const directory = await temporaryDirectory();
    await expect(generateUncommittedDatabaseDump("postgresql://fixture/source", {
      tmpDirectory: directory,
      spawn: spawnWith(validDump, 1, "synthetic failure") as any,
      selectTool: selector(),
    })).rejects.toThrow("pg_dump failed (code 1)");
    expect(await readdir(directory)).toEqual([]);
  });

  it("enforces the bounded generation/read limit and cleans up", async () => {
    const directory = await temporaryDirectory();
    await expect(generateUncommittedDatabaseDump("postgresql://fixture/source", {
      tmpDirectory: directory,
      spawn: spawnWith(validDump) as any,
      selectTool: selector(),
      maxBytes: 16,
    })).rejects.toThrow("exceeds the 16 byte generation limit");
    expect(await readdir(directory)).toEqual([]);
  });

  it("bounds pg_dump diagnostics and cleans up", async () => {
    const directory = await temporaryDirectory();
    await expect(generateUncommittedDatabaseDump("postgresql://fixture/source", {
      tmpDirectory: directory,
      spawn: spawnWith(validDump, 1, "x".repeat(17 * 1024)) as any,
      selectTool: selector(),
    })).rejects.toThrow("diagnostic output limit");
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects source-version drift and cleans up", async () => {
    const directory = await temporaryDirectory();
    await expect(generateUncommittedDatabaseDump("postgresql://fixture/source", {
      tmpDirectory: directory,
      spawn: spawnWith(validDump) as any,
      selectTool: selector(16),
    })).rejects.toThrow("did not match queried server major");
    expect(await readdir(directory)).toEqual([]);
  });
});