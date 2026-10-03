import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type CapsuleChanges = Record<string, string | null>;
type RecordBody = { seq: number; changes: CapsuleChanges };
const checksum = (body: string) => createHash("sha256").update(body).digest("hex");

/** Read complete records without converting the entire journal into one V8
 * string. Keep only the current record in memory; byte offsets preserve UTF-8
 * boundaries and allow recovery to truncate an unacknowledged partial append. */
function* completeLines(file: string): Generator<{ line: string; end: number }> {
  const fd = fs.openSync(file, "r");
  let offset = 0;
  let fragments: Buffer[] = [];
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(1024 * 1024);
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) return;
      let start = 0;
      for (let index = 0; index < count; index++) {
        if (chunk[index] !== 10) continue;
        fragments.push(chunk.subarray(start, index));
        yield { line: Buffer.concat(fragments).toString("utf8"), end: offset + index + 1 };
        fragments = [];
        start = index + 1;
      }
      if (start < count) fragments.push(Buffer.from(chunk.subarray(start, count)));
      offset += count;
    }
  } finally { fs.closeSync(fd); }
}

/** One owner's durable capsule transactions; only changed compressed objects
 * enter the log. The snapshot watermark makes replay/compaction idempotent. */
export class LocalPdimCapsuleJournal {
  publishedSeq = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private poisoned = false;
  constructor(readonly file: string) {}

  private decode(line: string): RecordBody {
    const envelope = JSON.parse(line);
    if (typeof envelope.body !== "string" || checksum(envelope.body) !== envelope.sha256) {
      throw new Error("Capsule journal checksum mismatch");
    }
    const record = JSON.parse(envelope.body);
    if (!Number.isSafeInteger(record.seq) || record.seq < 1 ||
        !record.changes || typeof record.changes !== "object" || Array.isArray(record.changes) ||
        Object.values(record.changes).some(v => v !== null && typeof v !== "string")) {
      throw new Error("Invalid capsule journal record");
    }
    return record;
  }

  recover(baseline: number, apply: (changes: CapsuleChanges) => void): void {
    this.publishedSeq = baseline;
    if (!fs.existsSync(this.file)) return;
    const size = fs.statSync(this.file).size;
    let end = 0;
    // An incomplete final append was never acknowledged. Remove it before
    // allowing another transaction to append; complete corrupt records fail shut.
    let previous = 0;
    let sequence = baseline;
    // Validate the whole committed log before publishing any recovered data.
    for (const item of completeLines(this.file)) {
      end = item.end;
      if (!item.line) continue;
      const record = this.decode(item.line);
      if (record.seq <= previous) throw new Error("Capsule journal sequence regression");
      previous = record.seq;
      if (record.seq <= baseline) continue;
      if (record.seq !== sequence + 1) throw new Error("Capsule journal sequence gap");
      sequence = record.seq;
    }
    for (const { line } of completeLines(this.file)) {
      if (!line) continue;
      const record = this.decode(line);
      if (record.seq <= baseline) continue;
      apply(record.changes);
      this.publishedSeq = record.seq;
    }
    if (end !== size) fs.truncateSync(this.file, end);
  }

  commit(changes: CapsuleChanges, publish: () => void): Promise<void> {
    const operation = this.tail.then(async () => {
      if (this.poisoned) throw new Error("Capsule journal requires recovery after failed rollback");
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const file = await fs.promises.open(this.file, "a+", 0o600);
      const size = (await file.stat()).size;
      const seq = this.publishedSeq + 1;
      const body = JSON.stringify({ seq, changes });
      try {
        await file.writeFile(JSON.stringify({ body, sha256: checksum(body) }) + "\n");
        await file.sync();
        // Also durably publish the journal's initial directory entry.
        const directory = await fs.promises.open(path.dirname(this.file), "r");
        try { await directory.sync(); } finally { await directory.close(); }
      } catch (error) {
        try { await file.truncate(size); await file.sync(); }
        catch { this.poisoned = true; }
        throw error;
      } finally {
        await file.close().catch(error => {
          this.poisoned = true;
          throw error;
        });
      }
      // No yield: snapshots must observe matching data and watermark.
      publish();
      this.publishedSeq = seq;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  compact(baseline: number): Promise<void> {
    const operation = this.tail.then(async () => {
      if (this.poisoned) return;
      if (!fs.existsSync(this.file)) return;
      const temporary = `${this.file}.compact-${process.pid}`;
      const file = await fs.promises.open(temporary, "w", 0o600);
      try {
        try {
          for (const { line } of completeLines(this.file)) {
            if (line && this.decode(line).seq > baseline) await file.writeFile(line + "\n");
          }
          await file.sync();
        } finally { await file.close(); }
        await fs.promises.rename(temporary, this.file);
      } finally { await fs.promises.rm(temporary, { force: true }); }
      const directory = await fs.promises.open(path.dirname(this.file), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}