import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type CapsuleChanges = Record<string, string | null>;
type RecordBody = { seq: number; changes: CapsuleChanges };
const checksum = (body: string) => createHash("sha256").update(body).digest("hex");

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
    const bytes = fs.readFileSync(this.file);
    const end = bytes.lastIndexOf(10) + 1;
    // An incomplete final append was never acknowledged. Remove it before
    // allowing another transaction to append; complete corrupt records fail shut.
    const records = bytes.subarray(0, end).toString("utf8").split("\n").filter(Boolean).map(line => this.decode(line));
    let previous = 0;
    for (const record of records) {
      if (record.seq <= previous) throw new Error("Capsule journal sequence regression");
      previous = record.seq;
      if (record.seq <= baseline) continue;
      if (record.seq !== this.publishedSeq + 1) throw new Error("Capsule journal sequence gap");
      apply(record.changes);
      this.publishedSeq = record.seq;
    }
    if (end !== bytes.length) fs.truncateSync(this.file, end);
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
      let raw: string;
      try { raw = await fs.promises.readFile(this.file, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      const retained = raw.split("\n").filter(Boolean)
        .filter(line => this.decode(line).seq > baseline);
      const temporary = `${this.file}.compact-${process.pid}`;
      const file = await fs.promises.open(temporary, "w", 0o600);
      try { await file.writeFile(retained.length ? retained.join("\n") + "\n" : ""); await file.sync(); }
      finally { await file.close(); }
      await fs.promises.rename(temporary, this.file);
      const directory = await fs.promises.open(path.dirname(this.file), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}