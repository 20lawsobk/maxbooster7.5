import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

const MAX_PATH_DIRECTORIES = 128;
const MAX_CANDIDATES_PER_TOOL = 32;
const MAX_OUTPUT_BYTES = 16 * 1024;
const PROBE_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 15_000;

type SpawnLike = typeof nodeSpawn;
type ToolName = "pg_dump" | "psql";

export interface PostgresTool {
  path: string;
  major: number;
  version: string;
}

export interface PostgresToolSelection {
  tool: PostgresTool;
  serverMajor: number;
  probes: PostgresTool[];
}

export interface ToolSelectionDependencies {
  spawn?: SpawnLike;
  access?: typeof fsPromises.access;
  realpath?: typeof fsPromises.realpath;
  env?: NodeJS.ProcessEnv;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function safePostgresDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s]+/gi, "[database-url-redacted]")
    .replace(/(password\s*[=:]\s*)\S+/gi, "$1[redacted]")
    .slice(0, 500);
}

function runBounded(
  command: string,
  args: string[],
  options: SpawnOptions,
  spawnImpl: SpawnLike,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, options);
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`PostgreSQL tool timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    const collect = (target: "stdout" | "stderr", chunk: unknown) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error("PostgreSQL tool exceeded diagnostic output limit"));
        }
        return;
      }
      if (target === "stdout") stdout += text;
      else stderr += text;
    };
    child.stdout?.on("data", chunk => collect("stdout", chunk));
    child.stderr?.on("data", chunk => collect("stderr", chunk));
    child.once("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function parsePostgresClientVersion(output: string): { major: number; version: string } {
  const match = output.match(/\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/i);
  if (!match) throw new Error("Unrecognized PostgreSQL client version output");
  return { major: Number(match[1]), version: `${match[1]}${match[2] ? `.${match[2]}` : ""}` };
}

export function parseServerMajor(output: string): number {
  const value = output.trim();
  if (!/^\d{5,6}$/.test(value)) throw new Error("Unrecognized PostgreSQL server version response");
  const versionNumber = Number(value);
  const major = Math.floor(versionNumber / 10_000);
  if (!Number.isInteger(major) || major < 9 || major > 99) {
    throw new Error("PostgreSQL server version is outside the supported range");
  }
  return major;
}

async function installedCandidates(
  name: ToolName,
  dependencies: ToolSelectionDependencies,
): Promise<string[]> {
  const env = dependencies.env ?? process.env;
  const access = dependencies.access ?? fsPromises.access;
  const realpath = dependencies.realpath ?? fsPromises.realpath;
  const directories = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  if (directories.length > MAX_PATH_DIRECTORIES) {
    throw new Error(`PostgreSQL tool discovery refused PATH with more than ${MAX_PATH_DIRECTORIES} entries`);
  }
  const executableName = process.platform === "win32" ? `${name}.exe` : name;
  const discovered = await Promise.all(directories.map(async directory => {
    const candidate = path.resolve(directory, executableName);
    try {
      await access(candidate, fsConstants.X_OK);
      return await realpath(candidate);
    } catch {
      return null;
    }
  }));
  const unique = [...new Set(discovered.filter((value): value is string => Boolean(value)))];
  if (unique.length > MAX_CANDIDATES_PER_TOOL) {
    throw new Error(`PostgreSQL tool discovery found more than ${MAX_CANDIDATES_PER_TOOL} ${name} candidates`);
  }
  return unique;
}

export async function probePostgresTools(
  name: ToolName,
  dependencies: ToolSelectionDependencies = {},
): Promise<PostgresTool[]> {
  const spawnImpl = dependencies.spawn ?? nodeSpawn;
  const candidates = await installedCandidates(name, dependencies);
  const probes = await Promise.all(candidates.map(async candidate => {
    try {
      const result = await runBounded(candidate, ["--version"], {
        env: dependencies.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }, spawnImpl, PROBE_TIMEOUT_MS);
      if (result.code !== 0) return null;
      const parsed = parsePostgresClientVersion(`${result.stdout}\n${result.stderr}`);
      return { path: candidate, ...parsed };
    } catch {
      return null;
    }
  }));
  return probes.filter((probe): probe is PostgresTool => Boolean(probe));
}

async function queryServerMajor(
  databaseUrl: string,
  psql: PostgresTool,
  dependencies: ToolSelectionDependencies,
): Promise<number> {
  const result = await runBounded(psql.path, [
    "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "SHOW server_version_num",
  ], {
    env: { ...(dependencies.env ?? process.env), PGDATABASE: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  }, dependencies.spawn ?? nodeSpawn, QUERY_TIMEOUT_MS);
  if (result.code !== 0) {
    throw new Error(`server version query exited with code ${result.code}`);
  }
  return parseServerMajor(result.stdout);
}

async function serverMajorWithAvailablePsql(
  databaseUrl: string,
  dependencies: ToolSelectionDependencies,
): Promise<{ serverMajor: number; psql: PostgresTool[] }> {
  const psql = await probePostgresTools("psql", dependencies);
  if (!psql.length) throw new Error("No executable, versioned psql candidate found on PATH");
  const failures: string[] = [];
  for (const candidate of [...psql].sort((a, b) => b.major - a.major)) {
    try {
      return { serverMajor: await queryServerMajor(databaseUrl, candidate, dependencies), psql };
    } catch (error) {
      failures.push(`${candidate.path} (${candidate.version}): ${safePostgresDiagnostic(error)}`);
    }
  }
  throw new Error(`Could not query PostgreSQL server major with installed psql clients: ${failures.join("; ")}`);
}

function compatibleTool(tools: PostgresTool[], serverMajor: number): PostgresTool | undefined {
  return [...tools]
    .filter(tool => tool.major >= serverMajor)
    .sort((a, b) => (a.major === serverMajor ? -1 : b.major === serverMajor ? 1 : a.major - b.major))[0];
}

export async function selectPgDumpForServer(
  databaseUrl: string,
  dependencies: ToolSelectionDependencies = {},
): Promise<PostgresToolSelection> {
  const [{ serverMajor }, dumps] = await Promise.all([
    serverMajorWithAvailablePsql(databaseUrl, dependencies),
    probePostgresTools("pg_dump", dependencies),
  ]);
  const tool = compatibleTool(dumps, serverMajor);
  if (!tool) {
    const found = dumps.length ? dumps.map(item => `${item.path}=${item.version}`).join(", ") : "none";
    throw new Error(`No compatible pg_dump for PostgreSQL server major ${serverMajor}; probed clients: ${found}`);
  }
  return { tool, serverMajor, probes: dumps };
}

export async function selectPsqlForRestore(
  targetUrl: string,
  dumpedServerMajor: number,
  dependencies: ToolSelectionDependencies = {},
): Promise<PostgresToolSelection> {
  const { serverMajor, psql } = await serverMajorWithAvailablePsql(targetUrl, dependencies);
  if (serverMajor < dumpedServerMajor) {
    throw new Error(
      `Restore target PostgreSQL major ${serverMajor} is older than dump source major ${dumpedServerMajor}`,
    );
  }
  const tool = compatibleTool(psql, serverMajor);
  if (!tool) {
    const found = psql.map(item => `${item.path}=${item.version}`).join(", ");
    throw new Error(`No compatible psql for restore target major ${serverMajor}; probed clients: ${found}`);
  }
  return { tool, serverMajor, probes: psql };
}

export function dumpedServerMajor(sql: Buffer | string): number {
  const header = (Buffer.isBuffer(sql) ? sql.subarray(0, 8192).toString("utf8") : sql.slice(0, 8192));
  const match = header.match(/^-- Dumped from database version\s+(\d+)(?:\.\d+)?/m);
  if (!match) throw new Error("Backup is missing PostgreSQL source-version metadata");
  return Number(match[1]);
}