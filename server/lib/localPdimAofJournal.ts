import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { RedisAofRecord } from "../../external/pdim/artifacts/api-server/src/redis/types.js";

type FrameBody = {
  from: number;
  through: number;
  records: readonly RedisAofRecord[];
};

type FrameEnvelope = { body: string; sha256: string };

const checksum = (body: string) =>
  createHash("sha256").update(body).digest("hex");

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureDurableDirectory(directory: string): Promise<void> {
  const missing: string[] = [];
  let current = path.resolve(directory);
  while (!fs.existsSync(current)) {
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) throw new Error("No existing ancestor for PDIM AOF directory");
    current = parent;
  }

  for (const created of missing.reverse()) {
    try {
      await fs.promises.mkdir(created);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.promises.stat(created);
      if (!stat.isDirectory()) throw error;
    }
    await syncDirectory(path.dirname(created));
  }
}

function isRecord(value: unknown): value is RedisAofRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RedisAofRecord>;
  return Number.isSafeInteger(record.s) && (record.s ?? 0) > 0 &&
    typeof record.c === "string" && Array.isArray(record.a) &&
    record.a.every((arg) => typeof arg === "string");
}

function encode(records: readonly RedisAofRecord[]): string {
  if (records.length === 0) throw new Error("Cannot encode an empty PDIM AOF frame");
  const body = JSON.stringify({
    from: records[0]!.s,
    through: records.at(-1)!.s,
    records,
  } satisfies FrameBody);
  return JSON.stringify({ body, sha256: checksum(body) } satisfies FrameEnvelope);
}

function decode(line: string): FrameBody {
  const envelope = JSON.parse(line) as Partial<FrameEnvelope>;
  if (typeof envelope.body !== "string" ||
      typeof envelope.sha256 !== "string" ||
      checksum(envelope.body) !== envelope.sha256) {
    throw new Error("Local PDIM AOF checksum mismatch");
  }
  const body = JSON.parse(envelope.body) as Partial<FrameBody>;
  if (!Number.isSafeInteger(body.from) || !Number.isSafeInteger(body.through) ||
      !Array.isArray(body.records) || body.records.length === 0 ||
      !body.records.every(isRecord) ||
      body.from !== body.records[0]!.s ||
      body.through !== body.records.at(-1)!.s) {
    throw new Error("Invalid local PDIM AOF frame");
  }
  for (let i = 1; i < body.records.length; i++) {
    if (body.records[i]!.s !== body.records[i - 1]!.s + 1) {
      throw new Error("Non-contiguous records in local PDIM AOF frame");
    }
  }
  return body as FrameBody;
}

/**
 * Durable redo log for ordinary local PDIM Redis mutations.
 *
 * A frame is appended and fsynced before the canonical Redis command is
 * acknowledged. Snapshots carry a sequence watermark; compaction only removes
 * records already covered by a durably published snapshot.
 */
export class LocalPdimAofJournal {
  private publishedSeq = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private poisoned = false;
  private recovered = false;

  constructor(readonly file: string) {}

  recover(baseline: number): RedisAofRecord[] {
    if (this.recovered) throw new Error("Local PDIM AOF journal recovered more than once");
    if (!Number.isSafeInteger(baseline) || baseline < 0) {
      throw new Error("Invalid local PDIM AOF snapshot watermark");
    }
    this.recovered = true;
    this.publishedSeq = baseline;
    if (!fs.existsSync(this.file)) return [];

    const bytes = fs.readFileSync(this.file);
    const end = bytes.lastIndexOf(10) + 1;
    const lines = bytes.subarray(0, end).toString("utf8").split("\n").filter(Boolean);
    const records: RedisAofRecord[] = [];
    let previousFrameEnd: number | null = null;
    for (const line of lines) {
      const frame = decode(line);
      const extendsPrevious = previousFrameEnd !== null &&
        frame.from === previousFrameEnd + 1;
      const beginsAfterSnapshot = previousFrameEnd !== null &&
        previousFrameEnd <= baseline && frame.from === baseline + 1;
      if (previousFrameEnd !== null && !extendsPrevious && !beginsAfterSnapshot) {
        throw new Error("Local PDIM AOF frame sequence discontinuity");
      }
      previousFrameEnd = frame.through;
      records.push(...frame.records);
    }

    const replay: RedisAofRecord[] = [];
    let replaySeq = baseline;
    for (const record of records) {
      if (record.s <= baseline) continue;
      if (record.s !== replaySeq + 1) {
        throw new Error("Local PDIM AOF sequence gap after snapshot watermark");
      }
      replay.push(record);
      replaySeq = record.s;
    }
    this.publishedSeq = Math.max(baseline, previousFrameEnd ?? 0);

    // A torn trailing frame cannot have been acknowledged because append()
    // resolves only after fsync. Remove it before accepting further appends.
    if (end !== bytes.length) fs.truncateSync(this.file, end);
    return replay;
  }

  append(records: readonly RedisAofRecord[]): Promise<void> {
    if (records.length === 0) return Promise.resolve();
    const operation = this.tail.then(async () => {
      if (!this.recovered) throw new Error("Local PDIM AOF journal must recover before append");
      if (this.poisoned) throw new Error("Local PDIM AOF journal requires recovery");
      let expected = this.publishedSeq + 1;
      for (const record of records) {
        if (!isRecord(record) || record.s !== expected) {
          throw new Error(`Local PDIM AOF expected sequence ${expected}`);
        }
        expected++;
      }

      await ensureDurableDirectory(path.dirname(this.file));
      const existed = fs.existsSync(this.file);
      const file = await fs.promises.open(this.file, "a+", 0o600);
      const size = (await file.stat()).size;
      try {
        await file.writeFile(encode(records) + "\n", "utf8");
        await file.sync();
        if (!existed) {
          // Persist the file entry. Newly-created parent entries were synced
          // individually by ensureDurableDirectory().
          await syncDirectory(path.dirname(this.file));
        }
      } catch (error) {
        try {
          await file.truncate(size);
          await file.sync();
        } catch {
          this.poisoned = true;
        }
        throw error;
      } finally {
        try {
          await file.close();
        } catch (error) {
          this.poisoned = true;
          throw error;
        }
      }
      this.publishedSeq = records.at(-1)!.s;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  compact(baseline: number): Promise<void> {
    const operation = this.tail.then(async () => {
      if (!Number.isSafeInteger(baseline) || baseline < 0 ||
          baseline > this.publishedSeq) {
        throw new Error("Local PDIM AOF compaction exceeds the durable sequence");
      }
      if (this.poisoned) throw new Error("Local PDIM AOF journal requires recovery");

      let raw: string;
      try {
        raw = await fs.promises.readFile(this.file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      if (raw.length > 0 && !raw.endsWith("\n")) {
        throw new Error("Cannot compact a torn local PDIM AOF journal");
      }
      const all = raw.split("\n").filter(Boolean).flatMap((line) => decode(line).records);
      const retained = all.filter((record) => record.s > baseline);
      if (retained.length > 0 && retained[0]!.s !== baseline + 1) {
        throw new Error("Local PDIM AOF compaction found a sequence gap");
      }
      const content = retained.length === 0 ? "" : `${encode(retained)}\n`;
      const temporary = `${this.file}.compact-${process.pid}-${randomUUID()}`;
      const file = await fs.promises.open(temporary, "wx", 0o600);
      try {
        await file.writeFile(content, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.promises.rename(temporary, this.file);
      const directory = await fs.promises.open(path.dirname(this.file), "r");
      try { await directory.sync(); } finally { await directory.close(); }
      this.publishedSeq = Math.max(baseline, retained.at(-1)?.s ?? 0);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}