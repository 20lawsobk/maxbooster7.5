import { constants } from "node:fs";
import { mkdir, open, rename, rm, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const STORAGE_MAX_FILE_BYTES = 500 * 1024 * 1024;
export const STORAGE_MAX_CHUNK_BYTES = 10 * 1024 * 1024;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class ChunkUploadError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}
interface Limits {
  maxFileBytes: number; maxChunkBytes: number; maxReservedBytes: number;
  maxUserReservedBytes: number; maxSessions: number; maxUserSessions: number;
  maxChunks: number; ttlMs: number;
}
export interface ChunkMetadata {
  fileId: string; userId: string; fileName: string; mimeType: string;
  category: string; fileSize: number; totalChunks: number;
}
type ChunkInput = Omit<ChunkMetadata, "fileSize" | "totalChunks"> & {
  fileSize: unknown; totalChunks: unknown; chunkIndex: unknown;
};
interface LockClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}
interface Manifest {
  version: 1; metadata: ChunkMetadata; chunks: Record<string, { size: number; sha256: string }>;
  bytes: number; lastActivity: number; state: "staging" | "completing" | "complete";
  key: string; token?: string; digest?: string;
}
interface Options {
  directory: string;
  connect: () => Promise<LockClient>;
  limits?: Partial<Limits>;
  now?: () => number;
}
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function integer(value: unknown): number {
  if (typeof value === "string" && value.length <= 16 && /^(0|[1-9][0-9]*)$/.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ChunkUploadError(400, "Chunk parameters must be whole numbers");
  return value;
}

function validMetadata(value: unknown, limits: Limits): value is ChunkMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.fileId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(metadata.fileId) &&
    typeof metadata.userId === "string" && /^[a-zA-Z0-9_-]{1,256}$/.test(metadata.userId) &&
    typeof metadata.fileName === "string" && metadata.fileName.length > 0 && metadata.fileName.length <= 255 &&
    !/[\\/\0]/.test(metadata.fileName) && ![".", ".."].includes(metadata.fileName) &&
    typeof metadata.category === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(metadata.category) &&
    typeof metadata.mimeType === "string" && metadata.mimeType.length <= 255 &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(metadata.mimeType) &&
    typeof metadata.fileSize === "number" && Number.isSafeInteger(metadata.fileSize) && metadata.fileSize > 0 && metadata.fileSize <= limits.maxFileBytes &&
    typeof metadata.totalChunks === "number" && Number.isSafeInteger(metadata.totalChunks) && metadata.totalChunks > 0 &&
    metadata.totalChunks <= limits.maxChunks && metadata.totalChunks <= metadata.fileSize &&
    metadata.totalChunks >= Math.ceil(metadata.fileSize / limits.maxChunkBytes);
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Shared-VM staging. All workers must use the same private directory and DB.
 * The short DB transaction serializes manifest changes, never object uploads.
 * Completing manifests remain reserved after a process crash: an unknown
 * storage/SQL outcome must not be silently retried as a new object.
 */
export class ChunkUploadSessions {
  private readonly limits: Limits;
  private readonly directory: string;
  private readonly lockId: string;
  private readonly now: () => number;
  constructor(private readonly options: Options) {
    if (!path.isAbsolute(options.directory)) throw new Error("Chunk staging directory must be absolute");
    this.directory = path.resolve(options.directory);
    this.lockId = BigInt(`0x${hash(this.directory).slice(0, 15)}`).toString();
    this.now = options.now ?? Date.now;
    this.limits = { maxFileBytes: STORAGE_MAX_FILE_BYTES, maxChunkBytes: STORAGE_MAX_CHUNK_BYTES,
      maxReservedBytes: STORAGE_MAX_FILE_BYTES * 2, maxUserReservedBytes: STORAGE_MAX_FILE_BYTES,
      maxSessions: 128, maxUserSessions: 4, maxChunks: 4096, ttlMs: DEFAULT_TTL_MS, ...options.limits };
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error("Invalid chunk staging limits");
  }
  private location(fileId: string) {
    if (typeof fileId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(fileId)) throw new ChunkUploadError(400, "Invalid upload session identifier");
    return path.join(this.directory, hash(fileId));
  }
  private async privateDirectory(directory: string) {
    // Reject symlinked ancestors as well as the final directory. A configured
    // staging path must never redirect into a public/media directory.
    let ancestor = path.parse(directory).root;
    for (const part of directory.slice(ancestor.length).split(path.sep).filter(Boolean)) {
      ancestor = path.join(ancestor, part);
      try { await mkdir(ancestor, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const parent = await lstat(ancestor);
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("Chunk staging cannot use symlinked directories");
    }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())) throw new Error("Chunk staging directory must be private and owned by the service");
  }
  private async read(file: string, maximum: number) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maximum || (stat.mode & 0o077) !== 0 ||
          (process.getuid && stat.uid !== process.getuid())) throw new Error("Invalid private chunk staging file");
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  private async atomic(file: string, data: Buffer | string) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      try { await handle.writeFile(data); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, file);
      const directory = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await rm(temporary, { force: true }); }
  }
  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    const client = await this.options.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [this.lockId]);
      await this.privateDirectory(this.directory);
      const result = await operation();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally { client.release(); }
  }
  private async manifest(fileId: string): Promise<Manifest | undefined> {
    const directory = this.location(fileId);
    try {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid chunk staging directory");
      const value = JSON.parse((await this.read(path.join(directory, "manifest.json"), 1024 * 1024)).toString()) as Manifest;
      // Treat corrupt state as unavailable, never as an empty/free reservation.
      if (value.version !== 1 || !validMetadata(value.metadata, this.limits) || value.metadata.fileId !== fileId ||
          !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > value.metadata.fileSize ||
          !Number.isSafeInteger(value.lastActivity) || value.lastActivity < 0 || !["staging", "completing", "complete"].includes(value.state) ||
          !value.chunks || typeof value.chunks !== "object" || Array.isArray(value.chunks) || typeof value.key !== "string") throw new Error("Invalid chunk upload manifest");
      const prefix = `users/${value.metadata.userId}/${value.metadata.category}/chunk-`, suffix = `/${value.metadata.fileName}`;
      if (!value.key.startsWith(prefix) || !value.key.endsWith(suffix) ||
          !UUID.test(value.key.slice(prefix.length, -suffix.length))) throw new Error("Invalid chunk storage key");
      let total = 0;
      for (const [index, chunk] of Object.entries(value.chunks)) {
        if (!/^(0|[1-9][0-9]*)$/.test(index) || Number(index) >= value.metadata.totalChunks ||
            !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > this.limits.maxChunkBytes || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error("Invalid chunk upload manifest");
        total += chunk.size;
      }
      const remaining = value.metadata.totalChunks - Object.keys(value.chunks).length;
      if (total !== value.bytes || remaining < 0 || total + remaining > value.metadata.fileSize ||
          total + remaining * this.limits.maxChunkBytes < value.metadata.fileSize ||
          (value.state === "staging" && (value.token !== undefined || value.digest !== undefined)) ||
          (value.state !== "staging" && (remaining !== 0 || total !== value.metadata.fileSize ||
            !UUID.test(value.token ?? "") || !/^[a-f0-9]{64}$/.test(value.digest ?? "")))) throw new Error("Invalid chunk upload accounting");
      return value;
    } catch (error) {
      // Only an absent session directory is a missing upload. A missing manifest
      // in an existing directory is corruption/uncertain creation, not free quota.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try { await lstat(directory); } catch (missing) { if ((missing as NodeJS.ErrnoException).code === "ENOENT") return undefined; }
      }
      throw error;
    }
  }
  private async save(value: Manifest) { await this.atomic(path.join(this.location(value.metadata.fileId), "manifest.json"), JSON.stringify(value)); }
  private async inventory(prune = false) {
    const result: Manifest[] = [];
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      if (!/^[a-f0-9]{64}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Invalid private chunk staging entry");
      const sessionDirectory = path.join(this.directory, entry.name);
      let raw;
      try { raw = JSON.parse((await this.read(path.join(sessionDirectory, "manifest.json"), 1024 * 1024)).toString()); }
      catch (error) {
        // A worker can die between mkdir and its first manifest rename. No
        // chunks are written before that manifest; reclaim only empty/initial
        // manifest-temporary directories, never a corrupt occupied session.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          const files = await readdir(sessionDirectory, { withFileTypes: true });
          if (files.every(file => file.isFile() && /^manifest\.json\.[a-f0-9-]+\.tmp$/.test(file.name))) {
            await rm(sessionDirectory, { recursive: true }); continue;
          }
        }
        throw error;
      }
      if (hash(String(raw.metadata?.fileId)) !== entry.name) throw new Error("Invalid chunk staging identity");
      const value = await this.manifest(raw.metadata.fileId);
      if (!value) throw new Error("Chunk staging changed under lock");
      if (prune && value.state !== "completing" && this.now() - value.lastActivity >= this.limits.ttlMs) await rm(path.join(this.directory, entry.name), { recursive: true });
      else result.push(value);
    }
    return result;
  }
  private counts(values: Manifest[], userId?: string) {
    const active = values.filter(value => value.state !== "complete" && (userId === undefined || value.metadata.userId === userId));
    return { sessions: active.length, reservedBytes: active.reduce((n, v) => n + v.metadata.fileSize, 0), bufferedBytes: active.reduce((n, v) => n + v.bytes, 0) };
  }
  async stats(userId?: string) { return this.locked(async () => this.counts(await this.inventory(), userId)); }
  async prune() { await this.locked(async () => { await this.inventory(true); }); }
  async accept(input: ChunkInput, chunk: Buffer) {
    const fileSize = integer(input.fileSize), totalChunks = integer(input.totalChunks), index = integer(input.chunkIndex);
    this.location(input.fileId);
    if (typeof input.userId !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(input.userId) ||
        typeof input.fileName !== "string" || !input.fileName || input.fileName.length > 255 || /[\\/\0]/.test(input.fileName) || [".", ".."].includes(input.fileName) ||
        typeof input.category !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.category) ||
        typeof input.mimeType !== "string" || input.mimeType.length > 255 ||
        (input.mimeType !== "" && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mimeType))) throw new ChunkUploadError(400, "Invalid upload session metadata");
    if (fileSize <= 0 || fileSize > this.limits.maxFileBytes || totalChunks <= 0 || totalChunks > this.limits.maxChunks ||
        totalChunks > fileSize || totalChunks < Math.ceil(fileSize / this.limits.maxChunkBytes) || index < 0 || index >= totalChunks) throw new ChunkUploadError(400, "Invalid chunk size, count or index");
    if (!Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > this.limits.maxChunkBytes || chunk.length > fileSize) throw new ChunkUploadError(400, "Chunk exceeds the declared upload bounds");
    const metadata: ChunkMetadata = { fileId: input.fileId, userId: input.userId, fileName: input.fileName,
      mimeType: input.mimeType || "application/octet-stream", category: input.category, fileSize, totalChunks };
    return this.locked(async () => {
      const all = await this.inventory(true);
      let upload = await this.manifest(input.fileId);
      if (upload && upload.metadata.userId !== input.userId) throw new ChunkUploadError(403, "Upload session belongs to a different user");
      if (upload && Object.keys(metadata).some(key => metadata[key as keyof ChunkMetadata] !== upload!.metadata[key as keyof ChunkMetadata])) throw new ChunkUploadError(409, "Upload session metadata cannot change");
      if (upload?.state === "completing") return { metadata: upload.metadata, uploaded: Object.keys(upload.chunks).length,
        total: totalChunks, complete: true, completed: false, pending: true, key: upload.key, token: upload.token, digest: upload.digest };
      if (!upload) {
        if (index !== 0) throw new ChunkUploadError(409, "Upload session is missing; restart from the first chunk");
        const global = this.counts(all), user = this.counts(all, input.userId);
        if (global.sessions >= this.limits.maxSessions || user.sessions >= this.limits.maxUserSessions || global.reservedBytes + fileSize > this.limits.maxReservedBytes || user.reservedBytes + fileSize > this.limits.maxUserReservedBytes) throw new ChunkUploadError(429, "Upload staging capacity is busy; finish or cancel an active upload and retry");
        // Receipts are bounded separately from active reservations. Retain the
        // most recent 128 responses; older receipts may be retried as new IDs.
        const receipts = all.filter(value => value.state === "complete").sort((a, b) => a.lastActivity - b.lastActivity);
        while (receipts.length >= this.limits.maxSessions) {
          const old = receipts.shift()!;
          await rm(this.location(old.metadata.fileId), { recursive: true });
        }
        upload = { version: 1, metadata, chunks: {}, bytes: 0, lastActivity: this.now(), state: "staging",
          key: `users/${metadata.userId}/${metadata.category}/chunk-${randomUUID()}/${metadata.fileName}` };
        await this.privateDirectory(this.location(input.fileId));
        await this.save(upload);
      }
      const digest = hash(chunk), existing = upload.chunks[index];
      if (existing && (existing.sha256 !== digest || existing.size !== chunk.length)) throw new ChunkUploadError(409, "An uploaded chunk cannot be replaced with different bytes");
      if (!existing) {
        const bytes = upload.bytes + chunk.length, remaining = totalChunks - Object.keys(upload.chunks).length - 1;
        if (bytes > fileSize || bytes + remaining > fileSize || bytes + remaining * this.limits.maxChunkBytes < fileSize) {
          await rm(this.location(input.fileId), { recursive: true });
          throw new ChunkUploadError(400, "Chunk bytes do not match the declared file size");
        }
        await this.atomic(path.join(this.location(input.fileId), `${index}.chunk`), chunk);
        upload.chunks[index] = { size: chunk.length, sha256: digest }; upload.bytes = bytes; upload.lastActivity = this.now();
        await this.save(upload);
      }
      return { metadata: upload.metadata, uploaded: Object.keys(upload.chunks).length, total: totalChunks,
        complete: Object.keys(upload.chunks).length === totalChunks, completed: upload.state === "complete", pending: false,
        key: upload.key, token: upload.token, digest: upload.digest };
    });
  }
  async beginCompletion(fileId: string, userId: string) {
    return this.locked(async () => {
      const upload = await this.manifest(fileId);
      if (!upload || upload.metadata.userId !== userId) throw new ChunkUploadError(403, "Upload session unavailable");
      if (upload.state !== "staging" || Object.keys(upload.chunks).length !== upload.metadata.totalChunks || upload.bytes !== upload.metadata.fileSize) throw new ChunkUploadError(409, "Upload is incomplete or already completing");
      const bytes = Buffer.allocUnsafe(upload.metadata.fileSize);
      let offset = 0;
      for (let index = 0; index < upload.metadata.totalChunks; index++) {
        const expected = upload.chunks[index];
        if (!expected) throw new ChunkUploadError(409, "Upload has a missing chunk");
        const chunk = await this.read(path.join(this.location(fileId), `${index}.chunk`), expected.size);
        if (chunk.length !== expected.size || hash(chunk) !== expected.sha256) throw new Error("Chunk integrity verification failed");
        chunk.copy(bytes, offset); offset += chunk.length;
      }
      if (offset !== bytes.length) throw new Error("Chunk assembly size verification failed");
      upload.state = "completing"; upload.token = randomUUID(); upload.digest = hash(bytes); upload.lastActivity = this.now();
      await this.save(upload);
      return { bytes, token: upload.token, key: upload.key, digest: upload.digest };
    });
  }
  async finishCompletion(fileId: string, userId: string, token: string) {
    await this.locked(async () => {
      const upload = await this.manifest(fileId);
      if (upload?.metadata.userId === userId && upload.state === "complete" && upload.token === token) return;
      if (!upload || upload.metadata.userId !== userId || upload.state !== "completing" || upload.token !== token) throw new ChunkUploadError(409, "Upload completion ownership changed");
      // Reclaim bytes before releasing the reservation. A crash here is still
      // recoverable from the already verified SQL record and completion token.
      for (const index of Object.keys(upload.chunks)) await rm(path.join(this.location(fileId), `${index}.chunk`), { force: true });
      upload.state = "complete"; upload.lastActivity = this.now(); await this.save(upload);
    });
  }
  async cancel(fileId: string, userId: string) {
    await this.locked(async () => {
      const upload = await this.manifest(fileId);
      if (upload && upload.metadata.userId !== userId) throw new ChunkUploadError(403, "Not authorized");
      if (upload?.state === "completing") throw new ChunkUploadError(409, "Upload completion outcome is pending; check your files before retrying");
      if (upload?.state === "complete") throw new ChunkUploadError(409, "Upload already completed; delete the stored file instead");
      await rm(this.location(fileId), { recursive: true, force: true });
    });
  }
  // Only a caller that has positively rolled back the deterministic object may
  // release an in-flight reservation. Unknown write outcomes remain reserved.
  async release(fileId: string, userId: string, token: string) {
    await this.locked(async () => {
      const upload = await this.manifest(fileId);
      if (!upload || upload.metadata.userId !== userId || upload.token !== token || upload.state !== "completing") throw new ChunkUploadError(409, "Upload completion ownership changed");
      await rm(this.location(fileId), { recursive: true });
    });
  }
}
