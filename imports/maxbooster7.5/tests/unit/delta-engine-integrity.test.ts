import { describe, expect, it, vi } from "vitest";
import { DeltaEngine } from "../../server/pocket-dimension/fabric/compression/DeltaEngine.js";

function header(baseBytes: number, targetBytes: number) {
  const bytes = Buffer.alloc(8);
  bytes.writeUInt32LE(baseBytes, 0);
  bytes.writeUInt32LE(targetBytes, 4);
  return bytes;
}
function copy(offset: number, length: number) {
  const bytes = Buffer.alloc(9);
  bytes[0] = 1;
  bytes.writeUInt32LE(offset, 1);
  bytes.writeUInt32LE(length, 5);
  return bytes;
}
function insert(bytes: Buffer, declared = bytes.length) {
  const operation = Buffer.alloc(5);
  operation[0] = 2;
  operation.writeUInt32LE(declared, 1);
  return Buffer.concat([operation, bytes]);
}

describe("delta wire integrity and bounded matching", () => {
  it("preserves the first source offset when maximal matches tie", () => {
    const engine = new DeltaEngine();
    const base = Buffer.alloc(128, 65);
    const target = Buffer.alloc(64, 65);
    expect(engine.encode(base, target)).toEqual(Buffer.concat([header(128, 64), copy(0, 64)]));
  });

  it("reconstructs a real edited repetitive version without rescanning equivalent maximal matches", () => {
    const engine = new DeltaEngine();
    const matching = engine as unknown as { matchLength(...args: unknown[]): number };
    const matches = vi.spyOn(matching, "matchLength");
    const filler = "version one of the document, unchanged filler text. ";
    const base = Buffer.from(filler.repeat(Math.ceil(200 * 1024 / (filler.length || 1))).slice(0, 200 * 1024));
    const target = Buffer.concat([Buffer.from("PREPENDED HEADER — v2 draft.\n"), base, Buffer.from("\nAPPENDED FOOTER — reviewed.")]);
    const delta = engine.encode(base, target);
    expect(engine.decode(base, delta)).toEqual(target);
    expect(delta.length).toBeLessThan(1024);
    // A linear number of successful copy runs suffices here. The previous
    // exhaustive tie scan performed 49,227 expensive candidate comparisons.
    expect(matches.mock.calls.length).toBeLessThan(1000);
  });

  it.each([
    [Buffer.alloc(0), Buffer.alloc(0)],
    [Buffer.from("old"), Buffer.alloc(0)],
    [Buffer.alloc(0), Buffer.from("new")],
    [Buffer.from("old version"), Buffer.from("new version")],
  ])("retains exact round trips for empty and literal-only versions (%#)", (base, target) => {
    const engine = new DeltaEngine();
    expect(engine.decode(base, engine.encode(base, target))).toEqual(target);
  });

  it("decodes an existing mixed copy/literal wire program", () => {
    const base = Buffer.from("base");
    const delta = Buffer.concat([header(4, 10), insert(Buffer.from("!")), copy(0, 4), insert(Buffer.from("?")), copy(0, 4)]);
    expect(new DeltaEngine().decode(base, delta).toString()).toBe("!base?base");
  });

  it.each(Array.from({ length: 8 }, (_, length) => length))("refuses a truncated %i-byte header", length => {
    expect(() => new DeltaEngine().decode(Buffer.from("base"), Buffer.alloc(length))).toThrow();
  });

  it.each([
    ["wrong base length", Buffer.concat([header(3, 4), copy(0, 4)])],
    ["copy crosses the base end", Buffer.concat([header(4, 2), copy(3, 2)])],
    ["copy starts at the base end", Buffer.concat([header(4, 1), copy(4, 1)])],
    ["copy exceeds output", Buffer.concat([header(4, 3), copy(0, 4)])],
    ["zero-length copy", Buffer.concat([header(4, 0), copy(0, 0)])],
    ["truncated copy fields", Buffer.concat([header(4, 1), Buffer.from([1, 0, 0])])],
    ["truncated literal length", Buffer.concat([header(4, 1), Buffer.from([2, 1])])],
    ["truncated literal bytes", Buffer.concat([header(4, 2), insert(Buffer.from("A"), 2)])],
    ["literal exceeds output", Buffer.concat([header(4, 1), insert(Buffer.from("AB"))])],
    ["zero-length literal", Buffer.concat([header(4, 0), insert(Buffer.alloc(0))])],
    ["incomplete output", Buffer.concat([header(4, 5), copy(0, 4)])],
    ["unknown operation", Buffer.concat([header(4, 0), Buffer.from([255])])],
    ["trailing bytes", Buffer.concat([header(4, 1), insert(Buffer.from("A")), Buffer.from([255])])],
  ])("refuses malformed deltas: %s", (_name, delta) => {
    expect(() => new DeltaEngine().decode(Buffer.from("base"), delta)).toThrow();
  });

  it("validates the complete program before allocating its declared output", () => {
    const delta = header(4, 0xffffffff);
    const allocation = vi.spyOn(Buffer, "allocUnsafe").mockImplementation(() => {
      throw new Error("Unexpected output allocation");
    });
    try {
      expect(() => new DeltaEngine().decode(Buffer.from("base"), delta)).toThrow(/invalid delta/i);
      expect(allocation).not.toHaveBeenCalled();
    } finally {
      allocation.mockRestore();
    }
  });
});
