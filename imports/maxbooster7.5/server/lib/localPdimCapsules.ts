import { createHash } from "node:crypto";
import type { RedisStore } from "../../external/pdim/artifacts/api-server/src/redis/store.js";
import type { CapsuleChanges } from "./localPdimCapsuleJournal.js";

interface CapsuleReference {
  format: "pdim-recursive-state-v1";
  namespace: string;
  entry: string;
  sha256: string;
  bytes: number;
}

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const referenceKey = (key: string) => `pdim:capsule:ref:${digest(key)}`;

/**
 * Actual state storage, not lifecycle bookkeeping. Payloads become canonical
 * PocketDimension chunks (PDCF containers) inside nested dimensions. Only their
 * references/metadata and compressed chunks enter the owner's durable snapshot.
 * Direct backing-store injection prevents a recursive HTTP call into the owner.
 */
export class LocalPdimCapsules {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: RedisStore,
    private readonly commit: (changes: CapsuleChanges, publish: () => void) => void | Promise<void>,
  ) {}

  exec(command: string, args: string[]): Promise<unknown> {
    // Compression, metadata publication and checkpoint commit share one finite
    // physical lane, independent of how many logical GPU lives exist.
    const operation = this.tail.then(() => this.execute(command.toUpperCase(), args));
    this.tail = operation.catch(() => {});
    return operation;
  }

  private async execute(command: string, args: string[]): Promise<unknown> {
    if (!["CAPSULE.SET", "CAPSULE.GET", "CAPSULE.DEL"].includes(command)) {
      throw new Error(`ERR unknown capsule command '${command}'`);
    }
    if (args.length !== (command === "CAPSULE.SET" ? 2 : 1) || !args[0]) {
      throw new Error(`ERR wrong number of arguments for '${command}'`);
    }
    const key = args[0];
    const refKey = referenceKey(key);
    const previous = await this.store.exec("GET", [refKey]);
    if (command === "CAPSULE.DEL") {
      const legacy = await this.store.exec("GET", [key]);
      const changes = { [refKey]: null, [key]: null };
      await this.commit(changes, () => this.store.publishEmbeddedStrings(changes));
      // Do not delete shared content-addressed chunks here. Reclamation requires
      // reachability across retained snapshots, not just live GPU references.
      return previous !== null || legacy !== null ? 1 : 0;
    }
    if (command === "CAPSULE.GET" && previous === null) {
      // Existing plain Redis snapshots remain readable, without a migration.
      return this.store.exec("GET", [key]);
    }

    const namespace = digest(key).slice(0, 2);
    const changes: CapsuleChanges = Object.create(null);
    const { PocketDimension } = await import("../pocket-dimension/index.js");
    const root = new PocketDimension({
      id: "local-compute-capsules",
      name: "local-compute-capsules",
      enableDeduplication: true,
      enableVersioning: false,
      storage: {
        get: async (name) => {
          if (Object.hasOwn(changes, name)) return changes[name];
          const result = await this.store.exec("GET", [name]);
          if (result !== null && typeof result !== "string") throw new Error("Invalid capsule backing value");
          return result;
        },
        set: async (name, value) => { changes[name] = value; return "OK"; },
      },
    });
    await root.open();
    const compute = await root.createNestedDimension("gpu-state");
    const pocket = await compute.createNestedDimension(namespace);

    if (command === "CAPSULE.GET") {
      const ref = JSON.parse(String(previous)) as CapsuleReference;
      if (ref.format !== "pdim-recursive-state-v1" || ref.namespace !== namespace ||
          !/^[a-f0-9]{64}$/.test(ref.entry) || ref.sha256 !== ref.entry ||
          !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) {
        throw new Error("Invalid recursive capsule reference");
      }
      const restored = await pocket.read(ref.entry);
      if (restored.length !== ref.bytes || digest(restored) !== ref.sha256) {
        throw new Error("Recursive capsule state checksum mismatch");
      }
      return restored.toString("utf8");
    }

    const bytes = Buffer.from(args[1], "utf8");
    const hash = digest(bytes);
    await pocket.write(hash, bytes, { depth: 2 });
    // Persists actual nested indexes and compressed chunks before publishing.
    await root.close();
    const reference: CapsuleReference = {
      format: "pdim-recursive-state-v1", namespace, entry: hash, sha256: hash, bytes: bytes.length,
    };
    changes[refKey] = JSON.stringify(reference);
    // Nothing reaches the shared owner map (or a concurrent checkpoint) until
    // the complete transaction is durably appended.
    await this.commit(changes, () => this.store.publishEmbeddedStrings(changes));
    return "OK";
  }
}