#!/usr/bin/env node
// Offline only: no application imports, database, provider, environment or network.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function exactKeys(value, allowed, label) {
  requireValue(object(value) && Object.keys(value).every(key => allowed.includes(key)), `Unknown ${label} shape`);
}
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const strings = value => Array.isArray(value) && value.every(item => typeof item === "string");
const streamId = value => typeof value === "string" && /^\d+-\d+$/.test(value);
function compareIds(left, right) {
  const a = left.split("-").map(BigInt), b = right.split("-").map(BigInt);
  return a[0] === b[0] ? (a[1] > b[1] ? 1 : a[1] === b[1] ? 0 : -1) : a[0] > b[0] ? 1 : -1;
}

export function validateEntries(entries, streamsOnly = false) {
  requireValue(object(entries), "Entries must be an object");
  for (const [key, entry] of Object.entries(entries)) {
    requireValue(object(entry), `Invalid entry ${key}`);
    exactKeys(entry, ["type", "value", "expiresAt", ...(entry.type === "stream" ? ["groups"] : [])], "entry");
    requireValue(entry.expiresAt === undefined || nonnegative(entry.expiresAt), `Invalid expiry ${key}`);
    if (streamsOnly) requireValue(entry.type === "stream", "Stream export contains non-stream state");
    switch (entry.type) {
      case "string":
        requireValue(typeof entry.value === "string", `Invalid string ${key}`); break;
      case "list":
      case "set":
        requireValue(strings(entry.value), `Invalid collection ${key}`);
        if (entry.type === "set") requireValue(new Set(entry.value).size === entry.value.length, `Duplicate set member ${key}`);
        break;
      case "hash":
        requireValue(object(entry.value) && Object.values(entry.value).every(value => typeof value === "string"), `Invalid hash ${key}`);
        break;
      case "zset": {
        requireValue(Array.isArray(entry.value), `Invalid zset ${key}`);
        const seen = new Set();
        for (const member of entry.value) {
          exactKeys(member, ["member", "score"], "zset member");
          requireValue(typeof member.member === "string" && Number.isFinite(member.score) && !seen.has(member.member), `Invalid zset member ${key}`);
          seen.add(member.member);
        }
        break;
      }
      case "stream": {
        requireValue(Array.isArray(entry.value) && object(entry.groups), `Incomplete stream ${key}`);
        let last = null;
        for (const item of entry.value) {
          exactKeys(item, ["id", "fields"], "stream item");
          requireValue(streamId(item.id) && strings(item.fields) && item.fields.length >= 2 &&
            item.fields.length % 2 === 0 && (!last || compareIds(item.id, last) > 0), `Invalid stream item ${key}`);
          last = item.id;
        }
        for (const group of Object.values(entry.groups)) {
          exactKeys(group, ["lastDeliveredId", "pending", "consumers"], "stream group");
          requireValue(streamId(group.lastDeliveredId) && Array.isArray(group.pending) && object(group.consumers), `Invalid stream group ${key}`);
          const pending = new Set();
          for (const item of group.pending) {
            exactKeys(item, ["id", "consumer", "deliveredAt", "count"], "pending entry");
            requireValue(streamId(item.id) && typeof item.consumer === "string" &&
              nonnegative(item.deliveredAt) && nonnegative(item.count) && !pending.has(item.id), `Invalid pending entry ${key}`);
            pending.add(item.id);
          }
          for (const [name, consumer] of Object.entries(group.consumers)) {
            exactKeys(consumer, ["name", "lastSeenAt"], "stream consumer");
            requireValue(consumer.name === name && nonnegative(consumer.lastSeenAt), `Invalid consumer ${key}`);
          }
        }
        break;
      }
      default: throw new Error(`Unsupported legacy entry type for ${key}`);
    }
  }
}

function encode(value) {
  const payload = JSON.stringify(value);
  return Buffer.from(JSON.stringify({ format: "pdim-checksummed-v2", payload, sha256: sha(payload) }));
}
function decode(bytes) {
  const value = JSON.parse(bytes);
  requireValue(value.format === "pdim-checksummed-v2" && typeof value.payload === "string" &&
    sha(value.payload) === value.sha256, "Invalid converted artifact checksum");
  return JSON.parse(value.payload);
}
const knownCommands = new Set(("SET GETSET MSET SETNX SETEX PSETEX INCR INCRBY DECR DECRBY APPEND DEL EXPIRE EXPIREAT PEXPIRE PERSIST RENAME RENAMENX COPY UNLINK LPUSH RPUSH LPUSHX RPUSHX LPOP RPOP LSET LINSERT LTRIM LREM LMOVE RPOPLPUSH HSET HMSET HDEL HINCRBY HINCRBYFLOAT HSETNX SADD SREM SUNIONSTORE SINTERSTORE SDIFFSTORE SMOVE ZADD ZREM ZINCRBY ZPOPMIN ZPOPMAX ZDIFFSTORE ZUNIONSTORE ZINTERSTORE FLUSHDB FLUSHALL").split(" "));

export async function convertLegacy(snapshotPath, aofPath, streamsPath, approvalPath, destination) {
  const originals = await Promise.all([snapshotPath, aofPath, streamsPath, approvalPath].map(path => readFile(path)));
  const [snapshot, aof, streams, approval] = originals.map(bytes => JSON.parse(bytes));
  exactKeys(snapshot, ["version", "savedAt", "entries", "baselineSeq"], "snapshot");
  exactKeys(aof, ["version", "records"], "AOF");
  exactKeys(streams, ["version", "baselineSeq", "entries"], "stream export");
  exactKeys(approval, ["instanceId", "baselineSeq", "snapshotSha256", "aofSha256", "streamsSha256",
    "freezeConfirmed", "streamsComplete", "expectedKeyCount"], "operator approval");
  requireValue(typeof approval.instanceId === "string" && /^[a-zA-Z0-9_-]+$/.test(approval.instanceId), "Missing instance identity");
  requireValue(approval.freezeConfirmed === true && approval.streamsComplete === true, "Frozen complete stream export must be confirmed");
  requireValue(snapshot.version === 1 && aof.version === 1 && streams.version === 1 &&
    nonnegative(snapshot.baselineSeq) && nonnegative(snapshot.savedAt) &&
    approval.baselineSeq === snapshot.baselineSeq && streams.baselineSeq === snapshot.baselineSeq,
  "Version or frozen checkpoint mismatch");
  for (const [index, key] of ["snapshotSha256", "aofSha256", "streamsSha256"].entries()) {
    requireValue(approval[key] === sha(originals[index]), `Input digest mismatch: ${key}`);
  }
  validateEntries(snapshot.entries);
  validateEntries(streams.entries, true);
  requireValue(Array.isArray(aof.records), "Invalid AOF records");
  let lastSequence = null;
  for (const record of aof.records) {
    exactKeys(record, ["s", "c", "a"], "AOF record");
    requireValue(nonnegative(record.s) && record.s > 0 && knownCommands.has(record.c) && strings(record.a), "Unknown or invalid AOF record");
    requireValue(lastSequence === null || record.s === lastSequence + 1, "Legacy AOF sequence gap");
    requireValue(record.s <= snapshot.baselineSeq,
      "AOF contains an uncheckpointed tail: freeze writers and export a completed final snapshot; no lossy conversion performed");
    lastSequence = record.s;
  }
  const entries = { ...snapshot.entries };
  for (const [key, entry] of Object.entries(streams.entries)) {
    requireValue(!Object.hasOwn(entries, key) || entries[key].type === "stream", `Stream key conflicts with non-stream key ${key}`);
    Object.defineProperty(entries, key, { value: entry, enumerable: true, configurable: true, writable: true });
  }
  for (const [key, entry] of Object.entries(snapshot.entries)) {
    if (entry.type === "stream") requireValue(Object.hasOwn(streams.entries, key), `Incomplete stream inventory ${key}`);
  }
  requireValue(nonnegative(approval.expectedKeyCount) && Object.keys(entries).length === approval.expectedKeyCount, "Frozen key inventory mismatch");
  const snapshotKey = `__snapshot__:migration-${randomUUID()}`;
  const snapshotBytes = encode({ ...snapshot, entries });
  // Every original AOF operation is already included in the approved snapshot.
  const aofBytes = encode({ version: 1, records: [] });
  const manifestBytes = encode({
    version: 1, snapshotKey, baselineSeq: snapshot.baselineSeq, previousSnapshotKey: null,
    snapshotSha256: sha(snapshotBytes),
  });
  // Never overwrite either input or an earlier output generation.
  await mkdir(destination, { mode: 0o700 });
  const artifacts = new Map([
    ["original-snapshot.json", originals[0]], ["original-aof.json", originals[1]],
    ["original-streams.json", originals[2]], ["operator-approval.json", originals[3]],
    ["snapshot.v2.json", snapshotBytes], ["aof.v2.json", aofBytes], ["manifest.v2.json", manifestBytes],
  ]);
  for (const [name, bytes] of artifacts) await writeFile(join(destination, name), bytes, { flag: "wx", mode: 0o600 });
  const ready = {
    instanceId: approval.instanceId, baselineSeq: snapshot.baselineSeq,
    keyCount: Object.keys(entries).length,
    files: Object.fromEntries([...artifacts].map(([name, bytes]) => [name, sha(bytes)])),
    uploadOrder: [
      { file: "snapshot.v2.json", name: snapshotKey },
      { file: "aof.v2.json", name: "__aof__" },
      { file: "manifest.v2.json", name: "__recovery_manifest__" },
    ],
    pocket: "redis-store", networkOperationsPerformed: false,
  };
  await writeFile(join(destination, "READY.json"), JSON.stringify(ready, null, 2), { flag: "wx", mode: 0o600 });
  return verifyConverted(destination);
}

export async function verifyConverted(directory) {
  const ready = JSON.parse(await readFile(join(directory, "READY.json"), "utf8"));
  const expected = ["original-snapshot.json", "original-aof.json", "original-streams.json",
    "operator-approval.json", "snapshot.v2.json", "aof.v2.json", "manifest.v2.json"];
  requireValue(object(ready.files) && Object.keys(ready.files).length === expected.length &&
    expected.every(name => typeof ready.files[name] === "string"), "Invalid conversion inventory");
  for (const name of expected) requireValue(sha(await readFile(join(directory, name))) === ready.files[name], `Artifact digest mismatch: ${name}`);
  const snapshotBytes = await readFile(join(directory, "snapshot.v2.json"));
  const snapshot = decode(snapshotBytes);
  const aof = decode(await readFile(join(directory, "aof.v2.json")));
  const manifest = decode(await readFile(join(directory, "manifest.v2.json")));
  validateEntries(snapshot.entries);
  requireValue(manifest.snapshotSha256 === sha(snapshotBytes) && manifest.baselineSeq === snapshot.baselineSeq &&
    ready.baselineSeq === snapshot.baselineSeq && ready.keyCount === Object.keys(snapshot.entries).length &&
    aof.version === 1 && Array.isArray(aof.records) && aof.records.length === 0, "Converted generation mismatch");
  requireValue(Array.isArray(ready.uploadOrder) && ready.uploadOrder.length === 3 &&
    ready.uploadOrder[0].file === "snapshot.v2.json" && ready.uploadOrder[0].name === manifest.snapshotKey &&
    ready.uploadOrder[1].file === "aof.v2.json" && ready.uploadOrder[1].name === "__aof__" &&
    ready.uploadOrder[2].file === "manifest.v2.json" && ready.uploadOrder[2].name === "__recovery_manifest__",
  "Invalid manifest-last upload plan");
  return { valid: true, instanceId: ready.instanceId, keyCount: ready.keyCount, baselineSeq: ready.baselineSeq };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const result = command === "convert" && args.length === 5 ? await convertLegacy(...args)
      : command === "verify" && args.length === 1 ? await verifyConverted(args[0])
      : (() => { throw new Error("Usage: convert-pdim-legacy-recovery.mjs convert snapshot.json aof.json streams.json approval.json NEW_OUTPUT_DIR | verify OUTPUT_DIR"); })();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}