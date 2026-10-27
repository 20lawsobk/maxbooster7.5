import { describe, expect, it } from "vitest";
import { assertHybridIndexReferenceIntegrity } from "../../server/services/hybridIndexReferenceIntegrity.js";

const primary = (hash = "sha256-a") => ({ contentHash: hash, isDeduplicated: false });
const alias = (ref = "primary", hash = "sha256-a") => ({
  contentHash: hash, isDeduplicated: true, deduplicationRef: ref,
});

const validate = (
  files: Array<[string, ReturnType<typeof primary> | ReturnType<typeof alias>]>,
  hashes: Array<[string, string[]]>,
  publicHashes: Array<[string, string]> = [],
) => assertHybridIndexReferenceIntegrity(new Map(files), new Map(hashes), new Map(publicHashes));

describe("hybrid persisted index reference integrity", () => {
  it("accepts a consistent primary, deduplicated alias, and public hash", () => {
    expect(() => validate(
      [["primary", primary()], ["alias", alias()]],
      [["sha256-a", ["primary", "alias"]]],
      [["sha256-a", "alias"]],
    )).not.toThrow();
  });
  it("accepts legacy public hashes that point to a private primary", () => {
    expect(() => validate([["primary", primary()]], [["sha256-a", ["primary"]]],
      [["sha256-a", "primary"]])).not.toThrow();
  });
  it("rejects cross-hash references before they can be used for deduplication", () => {
    expect(() => validate([["primary", primary("sha256-a")]],
      [["sha256-b", ["primary"]]])).toThrow("membership");
  });
  it("rejects an orphan file missing from its hash index", () => {
    expect(() => validate([["primary", primary()]], [])).toThrow("missing");
  });
  it("rejects duplicate membership across hash entries or within one entry", () => {
    expect(() => validate([["primary", primary()]],
      [["sha256-a", ["primary", "primary"]]])).toThrow("membership");
  });
  it("rejects missing or cross-hash deduplication primaries", () => {
    expect(() => validate([["alias", alias("missing")]],
      [["sha256-a", ["alias"]]])).toThrow("deduplication");
    expect(() => validate([["primary", primary("sha256-b")], ["alias", alias()]],
      [["sha256-b", ["primary"]], ["sha256-a", ["alias"]]])).toThrow("deduplication");
  });
  it("rejects a chained or self-referential deduplication reference", () => {
    expect(() => validate([["primary", primary()], ["alias", alias()], ["alias2", alias("alias")]],
      [["sha256-a", ["primary", "alias", "alias2"]]])).toThrow("deduplication");
    expect(() => validate([["self", alias("self")]],
      [["sha256-a", ["self"]]])).toThrow("deduplication");
  });
  it("rejects stale or wrong-hash public index references", () => {
    expect(() => validate([["primary", primary()]], [["sha256-a", ["primary"]]],
      [["sha256-b", "primary"]])).toThrow("public-hash");
    expect(() => validate([["primary", primary()]], [["sha256-a", ["primary"]]],
      [["sha256-a", "missing"]])).toThrow("public-hash");
  });
  it("rejects empty hash buckets and primary records with alias references", () => {
    expect(() => validate([], [["sha256-a", []]])).toThrow("membership");
    expect(() => validate([["primary", {...primary(), deduplicationRef:"other"}]],
      [["sha256-a", ["primary"]]])).toThrow("primary");
  });
});
