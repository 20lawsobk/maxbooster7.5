import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/pocket-dimension/fabric/compression/CodecMesh.js", () => ({
  codecMesh: {
    compress: async (bytes: Buffer) => ({ codec: "store", compressed: Buffer.from(bytes) }),
    decompress: async (_codec: string, payload: Buffer) => Buffer.from(payload),
  },
}));
vi.mock("../../server/pocket-dimension/fabric/compression/ContainerFormat.js", () => ({
  encodeContainer: (header: Record<string, unknown>, payload: Buffer) => {
    const prefix = Buffer.from(JSON.stringify(header) + "\n");
    return Buffer.concat([prefix, payload]);
  },
  decodeContainer: (encoded: Buffer) => {
    const delimiter = encoded.indexOf(10);
    if (delimiter < 0) throw new Error("Missing test container delimiter");
    return { header: JSON.parse(encoded.subarray(0, delimiter).toString("utf8")),
      payload: encoded.subarray(delimiter + 1) };
  },
}));

import { HybridImmutableByteStore, type HybridByteAuthority } from "../../server/services/hybridImmutableByteStore.js";

class MemoryAuthority implements HybridByteAuthority {
  readonly values = new Map<string, string>();
  get = vi.fn(async (key: string) => this.values.get(key) ?? null);
  set = vi.fn(async (key: string, value: string) => { this.values.set(key, value); });
  setnx = vi.fn(async (key: string, value: string) => {
    if (this.values.has(key)) return 0;
    this.values.set(key, value);
    return 1;
  });
  del = vi.fn(async (...keys: string[]) => {
    for (const key of keys) this.values.delete(key);
    return keys.length;
  });
}
const key = () => `hybrid:v2:${randomUUID()}`;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("immutable hybrid bytes — isolated authority contracts", () => {
  it("publishes bytes last and supports read-after-write across instances", async () => {
    const authority = new MemoryAuthority();
    const a = new HybridImmutableByteStore(authority);
    const b = new HybridImmutableByteStore(authority);
    const id = key(), bytes = Buffer.from("owner-bound immutable payload");
    const receipt = await a.write(id, bytes);
    expect(receipt.compressedSize).toBeGreaterThan(0);
    expect((await b.read(id)).equals(bytes)).toBe(true);
    const manifest = JSON.parse(authority.values.get(id)!);
    expect(manifest.sha256).toBe(hash(bytes));
    expect(manifest.chunks).toHaveLength(1);
    expect(authority.setnx.mock.calls.at(-1)?.[0]).toBe(id);
  });

  it("permits idempotent same-content retries but refuses replacement", async () => {
    const authority = new MemoryAuthority(), store = new HybridImmutableByteStore(authority);
    const id = key(), bytes = Buffer.from("original");
    const first = await store.write(id, bytes);
    expect(await store.write(id, Buffer.from(bytes))).toEqual(first);
    await expect(store.write(id, Buffer.from("modified"))).rejects.toThrow(/replacement refused/);
    expect((await store.read(id)).equals(bytes)).toBe(true);
  });

  it("never acknowledges a write without a confirmed manifest", async () => {
    const authority = new MemoryAuthority(), id = key();
    const original = authority.setnx;
    authority.setnx = vi.fn(async (target: string, value: string) =>
      target === id ? 0 : original(target, value));
    const store = new HybridImmutableByteStore(authority);
    await expect(store.write(id, Buffer.from("not committed"))).rejects.toThrow(/publication was not confirmed/);
    expect(authority.values.has(id)).toBe(false);
  });

  it("rejects a missing or modified chunk before returning bytes", async () => {
    const authority = new MemoryAuthority(), store = new HybridImmutableByteStore(authority);
    const id = key(), bytes = Buffer.from("integrity");
    await store.write(id, bytes);
    const manifest = JSON.parse(authority.values.get(id)!);
    const chunkKey = `${id}:chunk:${manifest.chunks[0].hash}`;
    const original = authority.values.get(chunkKey)!;
    authority.values.set(chunkKey, Buffer.from("tampered").toString("base64"));
    await expect(store.read(id)).rejects.toThrow(/checksum mismatch/);
    authority.values.delete(chunkKey);
    await expect(store.read(id)).rejects.toThrow(/chunk missing/);
    authority.values.set(chunkKey, original);
    expect((await store.read(id)).equals(bytes)).toBe(true);
  });

  it("rejects malformed manifests and invalid blob identifiers", async () => {
    const authority = new MemoryAuthority(), store = new HybridImmutableByteStore(authority);
    const id = key();
    authority.values.set(id, "{}");
    await expect(store.read(id)).rejects.toThrow(/Corrupt immutable hybrid manifest/);
    await expect(store.read("users/other/private")).rejects.toThrow(/Invalid immutable/);
  });

  it("preserves deletion intent on transport failure for an explicit retry", async () => {
    const authority = new MemoryAuthority(), store = new HybridImmutableByteStore(authority);
    const id = key();
    await store.write(id, Buffer.from("delete only after SQL intent"));
    const original = authority.del;
    let failOnce = true;
    authority.del = vi.fn(async (...keys: string[]) => {
      if (failOnce) { failOnce = false; throw new Error("fixture transport failure"); }
      return original(...keys);
    });
    await expect(store.delete(id)).rejects.toThrow(/fixture transport failure/);
    expect(authority.values.has(id)).toBe(true);
    expect(await store.delete(id)).toBe(true);
    expect(await store.delete(id)).toBe(false);
    expect(authority.values.size).toBe(0);
  });

  it("supports empty immutable files without fabricating content", async () => {
    const authority = new MemoryAuthority(), store = new HybridImmutableByteStore(authority);
    const id = key();
    const receipt = await store.write(id, Buffer.alloc(0));
    expect(receipt).toEqual({ compressedSize: 0 });
    expect((await store.read(id)).equals(Buffer.alloc(0))).toBe(true);
    expect(await store.delete(id)).toBe(true);
  });
});
