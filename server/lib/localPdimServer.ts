/**
 * Local PDIM Exec Server
 *
 * Single shared local owner of the imported canonical RedisStore. The cluster
 * primary starts it before forking; workers and MaxCore use its private HTTP
 * transport. It is not a fallback store and never attaches to an unknown owner.
 *
 * Protocol: POST /api/redis/instances/:id/exec
 *   Body:    { "cmd": "COMMAND", "args": ["arg1", "arg2", ...] }
 *   Reply:   JSON — the Redis command result (string | number | null | array | object)
 *
 * Requests execute through the canonical RedisStore (including real Lua,
 * blocking pops, and consumer groups). Mutations are acknowledged only after
 * the checksummed local AOF frame is fsynced; periodic snapshots compact covered
 * records. The historical Map shim below is not the request-serving store.
 */

import http from "http";
import fs from "fs";
import path from "path";
import { logger } from "../logger.js";
import { runtimePorts } from "../config/ports.js";
import cluster from "node:cluster";
import { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { RedisAofRecord, RedisEntry, StreamGroup } from "../../external/pdim/artifacts/api-server/src/redis/types.js";
import { LocalPdimCapsules } from "./localPdimCapsules.js";
import { LocalPdimCapsuleJournal } from "./localPdimCapsuleJournal.js";
import { LocalPdimAofJournal } from "./localPdimAofJournal.js";
import { readSnapshotJson, snapshotJsonChunks } from "./pdimSnapshotJson.js";
import { writeSnapshotOffThread } from "./pdimSnapshotWriter.js";

const LOCAL_PORT = runtimePorts.localPdim;
const PERSIST_FILE = path.resolve(
  process.env.LOCAL_PDIM_STORE_FILE ?? "./data/local-pdim-store.json",
);
const PERSIST_INTERVAL_MS = 30_000;
const CAPSULE_WATERMARK = "__local_pdim_capsule_journal_watermark__";
const REDIS_AOF_WATERMARK = "__local_pdim_redis_aof_watermark__";
const capsuleJournal = new LocalPdimCapsuleJournal(`${PERSIST_FILE}.capsules.jsonl`);
const redisAofJournal = new LocalPdimAofJournal(`${PERSIST_FILE}.aof.jsonl`);

// ── Store types ───────────────────────────────────────────────────────────────

type StrEntry = { type: "string"; value: string; expiresAt?: number };
type HashEntry = {
  type: "hash";
  value: Record<string, string>;
  expiresAt?: number;
};
type SetEntry = { type: "set"; value: string[]; expiresAt?: number };
type ZEntry = {
  type: "zset";
  value: { member: string; score: number }[];
  expiresAt?: number;
};
type ListEntry = { type: "list"; value: string[]; expiresAt?: number };
type StreamMsg = { id: string; fields: Record<string, string> };
type StreamEntry = {
  type: "stream";
  value: StreamMsg[];
  expiresAt?: number;
  groups?: Record<string, StreamGroup>;
};

type StoreEntry =
  | StrEntry
  | HashEntry
  | SetEntry
  | ZEntry
  | ListEntry
  | StreamEntry;

const store = new Map<string, StoreEntry>();
const canonicalStore = new RedisStore("local", "Max Booster shared local owner");
let snapshotAofBaseline = 0;
const capsuleStore = new LocalPdimCapsules(canonicalStore,
  (changes, publish) => capsuleJournal.commit(changes, publish));

// ── TTL helpers ───────────────────────────────────────────────────────────────

function expired(e: StoreEntry): boolean {
  return e.expiresAt !== undefined && Date.now() > e.expiresAt;
}


// ── Persistence ───────────────────────────────────────────────────────────────

// Recovery exports still use the synchronous linearization boundary below.
// Periodic snapshots must not block all loopback reads on disk fsync.
// Capsule commits use their scoped delta journal, never this whole-map path.
// A successful synchronous publication supersedes an in-flight async snapshot.
let snapshotPublication = 0;
let asyncSnapshotSequence = 0;
let snapshotTail: Promise<unknown> = Promise.resolve();

function saveStoreAsync(): Promise<boolean> {
  const operation = snapshotTail.then(async () => {
    const publication = snapshotPublication;
    const temporaryFile = `${PERSIST_FILE}.async-${process.pid}-${++asyncSnapshotSequence}`;
    try {
      await fs.promises.mkdir(path.dirname(PERSIST_FILE), { recursive: true });
      let writeFailure: unknown;
      const snapshot = await canonicalStore.captureEmbeddedCheckpoint((redisBaseline: number) => {
        const capsuleBaseline = capsuleJournal.publishedSeq;
        const obj: Record<string, StoreEntry> = {};
        for (const [key, value] of store) {
          if (!expired(value)) obj[key] = value;
        }
        obj[CAPSULE_WATERMARK] = {
          type: "string",
          value: String(capsuleBaseline),
        };
        obj[REDIS_AOF_WATERMARK] = {
          type: "string",
          value: String(redisBaseline),
        };
        return {
          // Attach the rejection handler immediately, even while the capture
          // boundary is unwinding, without concealing an unsuccessful write.
          writing: writeSnapshotOffThread(temporaryFile, obj).catch(error => { writeFailure = error; }),
          capsuleBaseline,
          redisBaseline,
        };
      });
      await snapshot.writing;
      if (writeFailure) throw writeFailure;
      if (snapshotPublication !== publication) {
        // A newer synchronous checkpoint already durably covers this state.
        await fs.promises.rm(temporaryFile, { force: true });
        return true;
      }
      // No await between version check and rename: never replace a newer
      // recovery checkpoint with an older in-flight snapshot.
      fs.renameSync(temporaryFile, PERSIST_FILE);
      const directory = await fs.promises.open(path.dirname(PERSIST_FILE), "r");
      try { await directory.sync(); } finally { await directory.close(); }
      snapshotPublication++;
      await redisAofJournal.compact(snapshot.redisBaseline);
      canonicalStore.compactEmbeddedAof(snapshot.redisBaseline);
      await capsuleJournal.compact(snapshot.capsuleBaseline);
      return true;
    } catch (err) {
      await fs.promises.rm(temporaryFile, { force: true }).catch(() => {});
      logger.error({ err }, `[LocalPDIM] Failed to persist store to ${PERSIST_FILE}`);
      return false;
    }
  });
  snapshotTail = operation;
  return operation;
}

function saveStore(): boolean {
  const temporaryFile = `${PERSIST_FILE}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
    const redisBaseline = canonicalStore.getEmbeddedAofSequence();
    const obj: Record<string, StoreEntry> = {};
    for (const [k, v] of store) {
      if (!expired(v)) obj[k] = v;
    }
    obj[CAPSULE_WATERMARK] = { type: "string", value: String(capsuleJournal.publishedSeq) };
    obj[REDIS_AOF_WATERMARK] = {
      type: "string",
      value: String(redisBaseline),
    };
    const output = fs.openSync(temporaryFile, "w", 0o600);
    try {
      for (const chunk of snapshotJsonChunks(obj)) fs.writeFileSync(output, chunk, "utf8");
      fs.fsyncSync(output);
    } finally { fs.closeSync(output); }
    fs.renameSync(temporaryFile, PERSIST_FILE);
    // Durably commit the rename itself, not only the temporary file contents.
    const directory = fs.openSync(path.dirname(PERSIST_FILE), "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    snapshotPublication++;
    return true;
  } catch (err) {
    try {
      fs.rmSync(temporaryFile, { force: true });
    } catch {
      // Preserve the original persistence error.
    }
    logger.error({ err }, `[LocalPDIM] Failed to persist store to ${PERSIST_FILE}`);
    return false;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((field) => typeof field === "string")
  );
}

function normalizePersistedStreamFields(fields: unknown): string[] {
  if (Array.isArray(fields)) {
    return fields.map((field: unknown) => {
      if (typeof field !== "string") {
        throw new Error("Invalid persisted stream field array");
      }
      return field;
    });
  }
  if (!fields || typeof fields !== "object") {
    throw new Error("Invalid persisted stream field map");
  }
  const flattened: string[] = [];
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error("Invalid persisted stream field map value");
    }
    flattened.push(key, value);
  }
  return flattened;
}

function validatePersistedEntry(key: string, value: unknown): StoreEntry {
  const invalid = (detail: string): never => {
    throw new Error(
      `invalid persistence entry for key ${JSON.stringify(key)}: ${detail}`,
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("entry must be an object");
  }
  const entry = value as Record<string, unknown>;
  const entryKeys = Object.keys(entry);
  if (
    !entryKeys.includes("type") ||
    !entryKeys.includes("value") ||
    entryKeys.some((field) => !["type", "value", "expiresAt", ...(entry.type === "stream" ? ["groups"] : [])].includes(field))
  ) {
    return invalid("entry fields must be exactly type, value, and optional expiresAt");
  }
  if (
    entry.expiresAt !== undefined &&
    (typeof entry.expiresAt !== "number" ||
      !Number.isFinite(entry.expiresAt) ||
      entry.expiresAt <= 0)
  ) {
    return invalid("expiresAt must be a positive finite number when present");
  }

  switch (entry.type) {
    case "string":
      if (typeof entry.value !== "string") return invalid("string value must be a string");
      break;
    case "hash":
      if (!isStringRecord(entry.value)) return invalid("hash value must map strings to strings");
      break;
    case "set":
    case "list":
      if (!Array.isArray(entry.value) || !entry.value.every((item) => typeof item === "string")) {
        return invalid(`${entry.type} value must be an array of strings`);
      }
      break;
    case "zset":
      if (
        !Array.isArray(entry.value) ||
        !entry.value.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            Object.keys(item).length === 2 &&
            Object.hasOwn(item, "member") &&
            Object.hasOwn(item, "score") &&
            typeof (item as Record<string, unknown>).member === "string" &&
            typeof (item as Record<string, unknown>).score === "number" &&
            Number.isFinite((item as Record<string, unknown>).score),
        )
      ) {
        return invalid("zset value must contain string members with finite scores");
      }
      break;
    case "stream":
      if (
        !Array.isArray(entry.value) ||
        !entry.value.every(
          (message) =>
            !!message &&
            typeof message === "object" &&
            !Array.isArray(message) &&
            Object.keys(message).length === 2 &&
            Object.hasOwn(message, "id") &&
            Object.hasOwn(message, "fields") &&
            typeof (message as Record<string, unknown>).id === "string" &&
            (isStringRecord((message as Record<string, unknown>).fields) ||
              (Array.isArray(message.fields) && message.fields.length % 2 === 0 &&
                message.fields.every((field: unknown) => typeof field === "string"))),
        )
      ) {
        return invalid("stream value must contain string ids and string field maps");
      }
      if (entry.groups !== undefined) {
        if (!entry.groups || typeof entry.groups !== "object" || Array.isArray(entry.groups)) {
          return invalid("stream groups must be an object");
        }
        for (const group of Object.values(entry.groups) as StreamGroup[]) {
          if (!group || typeof group.lastDeliveredId !== "string" ||
              !Array.isArray(group.pending) || !group.pending.every((p: { id: unknown; consumer: unknown; deliveredAt: unknown; count: unknown }) =>
                p && typeof p.id === "string" && typeof p.consumer === "string" &&
                Number.isFinite(p.deliveredAt) && Number.isFinite(p.count)) ||
              !group.consumers || typeof group.consumers !== "object" ||
              Array.isArray(group.consumers) || !Object.values(group.consumers).every((c: { name: unknown; lastSeenAt: unknown }) =>
                c && typeof c.name === "string" && Number.isFinite(c.lastSeenAt))) {
            return invalid("invalid stream consumer group");
          }
        }
      }
      break;
    default:
      return invalid("unknown entry type");
  }
  return value as StoreEntry;
}

function loadStore(): void {
  snapshotAofBaseline = 0;
  if (!fs.existsSync(PERSIST_FILE)) return;
  try {
    const data = readSnapshotJson(PERSIST_FILE);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("persistence root must be a JSON object");
    }
    const persisted = data as Record<string, unknown>;
    const watermark = persisted[REDIS_AOF_WATERMARK];
    if (watermark !== undefined) {
      const entry = validatePersistedEntry(REDIS_AOF_WATERMARK, watermark);
      if (entry.type !== "string") throw new Error("Invalid Redis AOF watermark entry");
      snapshotAofBaseline = Number(entry.value);
      if (!Number.isSafeInteger(snapshotAofBaseline) || snapshotAofBaseline < 0) {
        throw new Error("Invalid Redis AOF snapshot watermark");
      }
    }
    // Validate the complete snapshot before mutating the live map. A corrupt
    // later entry must never leave a partially restored process.
    const validated = Object.entries(persisted)
      .filter(([key]) => key !== REDIS_AOF_WATERMARK)
      .map(
      ([key, value]) => [key, validatePersistedEntry(key, value)] as const,
    );
    let loaded = 0;
    for (const [k, v] of validated) {
      if (!expired(v)) {
        // Sets: restore as plain arrays (JSON round-trip)
        store.set(k, v);
        loaded++;
      }
    }
    logger.info(
      `[LocalPDIM] Restored ${loaded} entries from ${PERSIST_FILE}`,
    );
  } catch (err) {
    throw new Error(
      `[LocalPDIM] Failed to load local PDIM persistence file ${PERSIST_FILE}; refusing to start to avoid silent data loss`,
      { cause: err },
    );
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

let _server: http.Server | null = null;
let _finalSaveFailed = false;
let _persistTimer: ReturnType<typeof setInterval> | null = null;
let _saveOnShutdown: (() => void) | null = null;
let _starting: Promise<void> | null = null;

export function getLocalPdimUrl(): string {
  return `http://127.0.0.1:${LOCAL_PORT}/api/redis/instances/local/exec`;
}

export function isLocalPdimServerOwnedByThisProcess(): boolean {
  const address = _server?.address();
  return (
    _server?.listening === true &&
    !!address &&
    typeof address !== "string" &&
    address.address === "127.0.0.1" &&
    address.port === LOCAL_PORT
  );
}

export interface LocalPdimSnapshotDescriptor {
  fd: number;
  bytes: number;
  device: number;
  inode: number;
  sourcePath: string;
  recoveryPoint: "synchronous-event-loop-linearized";
}

export function assertLocalPdimSnapshotAuthority(input: {
  configuredExecUrl: string;
  expectedExecUrl: string;
  serverListening: boolean;
  serverAddress: ReturnType<http.Server["address"]>;
  sourcePath: string;
  expectedSourcePath: string;
}): void {
  let configured: URL;
  let expected: URL;
  try {
    configured = new URL(input.configuredExecUrl);
    expected = new URL(input.expectedExecUrl);
  } catch {
    throw new Error("PDIM snapshot authority is not a valid configured URL");
  }
  const address = input.serverAddress;
  if (
    !input.serverListening ||
    !address ||
    typeof address === "string" ||
    address.address !== "127.0.0.1" ||
    String(address.port) !== expected.port ||
    configured.origin !== expected.origin ||
    configured.pathname !== expected.pathname ||
    path.resolve(input.sourcePath) !== path.resolve(input.expectedSourcePath)
  ) {
    throw new Error(
      "PDIM snapshot authority mismatch: configured backend is not this owned local store",
    );
  }
}

/**
 * Linearizes a recovery point in the same event-loop turn as the local command
 * executor, durably commits it, and pins the committed inode before yielding.
 * The caller owns and must close the returned read-only descriptor.
 */
export function openConsistentLocalPdimSnapshot(): LocalPdimSnapshotDescriptor {
  const configuredExecUrl =
    process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL || "";
  assertLocalPdimSnapshotAuthority({
    configuredExecUrl,
    expectedExecUrl: getLocalPdimUrl(),
    serverListening: _server?.listening === true,
    serverAddress: _server?.address() ?? null,
    sourcePath: PERSIST_FILE,
    expectedSourcePath: path.resolve("./data/local-pdim-store.json"),
  });
  if (!saveStore()) throw new Error("Could not commit the local PDIM recovery point");

  const link = fs.lstatSync(PERSIST_FILE);
  if (!link.isFile() || link.isSymbolicLink()) {
    throw new Error("Committed local PDIM snapshot is not a regular owned file");
  }
  const fd = fs.openSync(PERSIST_FILE, fs.constants.O_RDONLY);
  try {
    const pinned = fs.fstatSync(fd);
    const current = fs.statSync(PERSIST_FILE);
    if (
      !pinned.isFile() ||
      pinned.dev !== current.dev ||
      pinned.ino !== current.ino ||
      pinned.size !== current.size
    ) {
      throw new Error("Committed local PDIM snapshot inode could not be pinned");
    }
    return {
      fd,
      bytes: pinned.size,
      device: pinned.dev,
      inode: pinned.ino,
      sourcePath: PERSIST_FILE,
      recoveryPoint: "synchronous-event-loop-linearized",
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function openLocalPubSubStream(
  res: import("node:http").ServerResponse,
  requestController: AbortController,
  channels: string[],
  patterns: string[],
): void {
  const maxBufferedBytes = 1024 * 1024;
  let closed = false;
  let blocked = false;
  let bufferedBytes = 0;
  let pending: string[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};

  const dispose = () => {
    if (closed) return;
    closed = true;
    res.off("drain", flush);
    res.off("close", onResponseClose);
    requestController.signal.removeEventListener("abort", onAbort);
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    pending = [];
    bufferedBytes = 0;
  };

  const flush = () => {
    if (closed || res.destroyed) return;
    blocked = false;
    while (pending.length > 0) {
      const line = pending.shift()!;
      bufferedBytes -= Buffer.byteLength(line);
      if (!res.write(line)) {
        blocked = true;
        break;
      }
    }
  };

  const closeStream = () => {
    if (!requestController.signal.aborted) {
      requestController.abort(new Error("PDIM Pub/Sub stream closed"));
    }
  };

  const onAbort = () => {
    dispose();
    if (!res.destroyed && !res.writableEnded) res.end();
  };

  const onResponseClose = () => {
    if (!res.writableEnded && !requestController.signal.aborted) {
      requestController.abort(new Error("PDIM Pub/Sub client disconnected"));
    }
    dispose();
  };

  const send = (event: object) => {
    if (closed || res.destroyed) return;
    const line = `${JSON.stringify(event)}\n`;
    if (blocked || pending.length > 0) {
      bufferedBytes += Buffer.byteLength(line);
      if (bufferedBytes > maxBufferedBytes) {
        closeStream();
        return;
      }
      pending.push(line);
      return;
    }
    if (!res.write(line)) blocked = true;
  };

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.on("drain", flush);
  res.on("close", onResponseClose);
  requestController.signal.addEventListener("abort", onAbort, { once: true });

  unsubscribe = canonicalStore.subscribePubSub(
    channels,
    patterns,
    send,
    closeStream,
  );
  if (requestController.signal.aborted) {
    onAbort();
    return;
  }
  send({ type: "ready", subscriptionCount: channels.length + patterns.length });
  heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
  heartbeat.unref();
}

export function startLocalPdimServer(): Promise<void> {
  if (cluster.isWorker || process.env.CLUSTER_WORKER_ID !== undefined) {
    return Promise.reject(new Error("Only the cluster primary may own local PDIM"));
  }
  if (_starting) return _starting;
  _starting = new Promise<void>((resolve, reject) => {
    if (_server) {
      resolve();
      return;
    }

    loadStore();
    const watermark = store.get(CAPSULE_WATERMARK);
    const capsuleBaseline = watermark?.type === "string" ? Number(watermark.value) : 0;
    if (!Number.isSafeInteger(capsuleBaseline) || capsuleBaseline < 0) {
      throw new Error("Invalid capsule journal snapshot watermark");
    }
    store.delete(CAPSULE_WATERMARK);
    capsuleJournal.recover(capsuleBaseline, changes => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) store.delete(key);
        else store.set(key, { type: "string", value });
      }
    });
    // Older snapshots used field maps and had no consumer groups. Preserve
    // their data while adopting the canonical engine's stream representation.
    for (const entry of store.values()) {
      if (entry.type === "stream") {
        const stream = entry as unknown as Extract<RedisEntry, { type: "stream" }>;
        stream.value = stream.value.map((message) => ({
          id: message.id,
          fields: normalizePersistedStreamFields(message.fields),
        }));
        stream.groups ??= {};
      }
    }
    const redisAofRecords = redisAofJournal.recover(snapshotAofBaseline);
    canonicalStore.attachEmbeddedSnapshot(
      store as unknown as Map<string, RedisEntry>,
      {
        baselineSequence: snapshotAofBaseline,
        recoveryRecords: redisAofRecords,
        appendAof: (records: readonly RedisAofRecord[]) => redisAofJournal.append(records),
      },
    );
    canonicalStore.on("durability-error", (error: Error) => {
      logger.error(
        { err: error },
        "[LocalPDIM] Durable Redis journal failed; the owner is unavailable",
      );
    });
    if (redisAofRecords.length > 0) {
      logger.info(
        `[LocalPDIM] Replayed ${redisAofRecords.length} durable Redis mutation(s)`,
      );
    }

    _server = http.createServer((req, res) => {
      // Loopback-only listener; never mounted on Express/public routes, and
      // never accepts forwarded identity headers as authentication.
      const token = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      if (token && req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized private PDIM channel" }));
        return;
      }
      if (req.url !== "/api/redis/instances/local/exec") {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }

      const requestController = new AbortController();
      req.on("aborted", () => {
        requestController.abort(new Error("PDIM HTTP request aborted by client"));
      });
      res.on("close", () => {
        if (!res.writableEnded) {
          requestController.abort(new Error("PDIM HTTP response closed by client"));
        }
      });

      let body = "";
      let bytes = 0;
      req.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 50 * 1024 * 1024) {
          res.writeHead(413).end();
          req.destroy();
          return;
        }
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const {
            cmd,
            args = [],
            stream = false,
            patterns = [],
          } = JSON.parse(body) as {
            cmd: string;
            args?: unknown[];
            stream?: boolean;
            patterns?: unknown[];
          };
          if (typeof cmd !== "string" || !Array.isArray(args) ||
              args.some((arg) => arg === null || arg === undefined || typeof arg === "object")) {
            throw new TypeError("PDIM requires a command and non-null scalar arguments");
          }
          if (stream) {
            if (cmd.toUpperCase() !== "SUBSCRIBE" ||
                args.some((channel) => typeof channel !== "string") ||
                !Array.isArray(patterns) ||
                patterns.some((pattern) => typeof pattern !== "string")) {
              throw new TypeError("PDIM Pub/Sub requires string channels and patterns");
            }
            const channels = [...new Set(args as string[])];
            const uniquePatterns = [...new Set(patterns as string[])];
            if (channels.length + uniquePatterns.length === 0) {
              throw new TypeError("PDIM Pub/Sub requires at least one subscription");
            }
            openLocalPubSubStream(res, requestController, channels, uniquePatterns);
            return;
          }
          const result = cmd.toUpperCase().startsWith("CAPSULE.")
            ? await capsuleStore.exec(cmd, args.map(String))
            : await canonicalStore.exec(cmd, args.map(String), requestController.signal);
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          if (requestController.signal.aborted || res.destroyed || res.writableEnded) return;
          if (res.headersSent) {
            res.destroy(err instanceof Error ? err : undefined);
            return;
          }
          const status =
            (err as { code?: unknown })?.code === "PDIM_DURABILITY_FAILURE"
              ? 503
              : 400;
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Bad Request",
            }),
          );
        }
      });
    });

    _server.listen(LOCAL_PORT, "127.0.0.1", () => {
      logger.info(
        `[LocalPDIM] ✅ Local PDIM exec server started on port ${LOCAL_PORT} (canonical RedisStore + fsynced AOF + snapshots)`,
      );

      // Periodic persistence (unref so it doesn't block exit)
      let periodicSavePending = false;
      _persistTimer = setInterval(() => {
        if (periodicSavePending) return;
        periodicSavePending = true;
        void saveStoreAsync().finally(() => { periodicSavePending = false; });
      }, PERSIST_INTERVAL_MS);
      _persistTimer.unref();

      // Save on clean shutdown. Mark the process unsuccessful if the final
      // durability boundary cannot be completed.
      const saveOnShutdown = () => {
        if (!saveStore()) {
          _finalSaveFailed = true;
          process.exitCode = 1;
        }
      };
      _saveOnShutdown = saveOnShutdown;
      process.on("SIGTERM", saveOnShutdown);
      process.on("SIGINT", saveOnShutdown);
      // Preserve the failure even if another shutdown coordinator subsequently
      // calls process.exit(0).
      process.on("exit", () => {
        if (_finalSaveFailed) process.exitCode = 1;
      });

      resolve();
    });

    _server.on("error", (err: NodeJS.ErrnoException) => {
      _server = null;
      reject(err); // An occupied port is not proof of a shared, trusted owner.
    });
  }).finally(() => { _starting = null; });
  return _starting;
}

export async function stopLocalPdimServer(): Promise<void> {
  const server = _server;
  _server = null;
  if (!server) return;
  if (_persistTimer) clearInterval(_persistTimer);
  _persistTimer = null;
  if (_saveOnShutdown) {
    process.off("SIGTERM", _saveOnShutdown);
    process.off("SIGINT", _saveOnShutdown);
    _saveOnShutdown = null;
  }
  canonicalStore.closeEmbedded();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await snapshotTail;
}
