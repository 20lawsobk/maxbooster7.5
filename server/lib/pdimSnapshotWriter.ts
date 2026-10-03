import { Worker } from "node:worker_threads";

// Plain JS is intentional: eval workers work in both tsx dev and the bundled
// production server without relying on an unbundled worker file or TS loader.
const writer = `
const fs = require("node:fs");
const { parentPort, workerData } = require("node:worker_threads");
let fd;
let first = true;
try {
  fd = fs.openSync(workerData.file, "wx", 0o600);
  fs.writeFileSync(fd, "{");
  parentPort.on("message", rows => {
    try {
      if (rows === null) {
        fs.writeFileSync(fd, "}");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        parentPort.postMessage({ ok: true });
        parentPort.close();
      } else {
        for (const [key, value] of rows) {
          fs.writeFileSync(fd, (first ? "" : ",") + JSON.stringify(key) + ":" + JSON.stringify(value));
          first = false;
        }
        parentPort.postMessage({ ready: true });
      }
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      throw error;
    }
  });
  parentPort.postMessage({ ready: true });
} catch (error) {
  if (fd !== undefined) fs.closeSync(fd);
  throw error;
}
`;

// Redis entries are JSON-shaped. Copy mutable containers at the checkpoint
// boundary, but retain immutable string references instead of copying 500+ MB.
function capture(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value);
  const result: any = Array.isArray(value) ? [] : Object.create(null);
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) result[key] = capture(item, seen);
  return result;
}

function transferSize(value: unknown, seen = new Set<object>()): number {
  if (typeof value === "string") return value.length * 2;
  if (!value || typeof value !== "object" || seen.has(value)) return 8;
  seen.add(value);
  return Object.entries(value).reduce((size, [key, item]) => size + key.length * 2 + transferSize(item, seen), 0);
}

/**
 * Synchronously captures mutable entry containers. Call inside the
 * checkpoint capture boundary; subsequent live mutations cannot change this
 * snapshot. Serialization, file writes and fsync happen outside the event loop.
 * Resolves only after worker exit, so callers may safely publish or remove the
 * temporary file with no background writer still touching it.
 */
export function writeSnapshotOffThread(file: string, entries: Record<string, unknown>): Promise<void> {
  const captured = Object.entries(capture(entries) as Record<string, unknown>);
  const worker = new Worker(writer, { eval: true, execArgv: [], workerData: { file } });
  return new Promise((resolve, reject) => {
    let completed = false;
    let failure: Error | undefined;
    let offset = 0;
    worker.on("message", message => {
      if (message?.ok) completed = true;
      if (message?.ready) setImmediate(() => {
        try {
          if (offset === captured.length) { worker.postMessage(null); return; }
          const batch = [];
          let bytes = 0;
          while (offset < captured.length && bytes < 1024 * 1024 && batch.length < 64) {
            const entry = captured[offset++];
            batch.push(entry);
            bytes += transferSize(entry);
          }
          worker.postMessage(batch);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          void worker.terminate();
        }
      });
    });
    worker.once("error", error => { failure = error; });
    worker.once("exit", code => {
      if (code === 0 && completed && !failure) resolve();
      else reject(failure ?? new Error(`Snapshot worker exited without a durable result (code ${code})`));
    });
  });
}