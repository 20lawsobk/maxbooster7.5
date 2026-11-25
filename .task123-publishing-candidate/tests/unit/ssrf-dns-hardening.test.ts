import { describe, it, expect } from "vitest";
import { parseName, parsePacket } from "../../server/services/recursiveResolver";
import { bandcampSlug, fetchBandcampPage } from "../../server/services/bandcampUrl";
import { safeFetchBuffer } from "../../server/services/safeUrlFetch";

describe("untrusted DNS names", () => {
  it("rejects the reported self-pointer immediately", () => {
    expect(() => parseName(Buffer.from("123484000001000000000000c00c00010001","hex"),12)).toThrow();
    expect(parsePacket(Buffer.from("123484000001000000000000c00c00010001","hex"))).toBeNull();
  });
  it("discards malformed answer records and missing declared sections", () => {
    expect(parsePacket(Buffer.from("123484000000000100000000c00c000100010000003c000400000000","hex"))).toBeNull();
    expect(parsePacket(Buffer.from("123484000000000100000000","hex"))).toBeNull();
  });
  it("bounds long acyclic pointer chains", () => {
    const buf = Buffer.alloc(401);
    for (let i = 0; i < 400; i += 2) buf.writeUInt16BE(0xc000 | (i + 2), i);
    expect(() => parseName(buf,0)).toThrow();
  });
  it.each(["c002c000", "c0", "c0ff", "4000", "036162", ""])("rejects malformed name %s", hex => {
    expect(() => parseName(Buffer.from(hex,"hex"),0)).toThrow();
  });
  it("accepts ordinary names and valid compression", () => {
    const buf = Buffer.from("03666f6f03636f6d00c000","hex");
    expect(parseName(buf,0)).toEqual(["foo.com",9]);
    expect(parseName(buf,9)).toEqual(["foo.com",11]);
  });
});
describe("Bandcamp destination boundary", () => {
  it.each(["https://evil.example/?x=.bandcamp.com", "https://artist.bandcamp.com.evil.example",
    "https://user@artist.bandcamp.com", "http://artist.bandcamp.com", "https://artist.bandcamp.com:444"])("rejects %s", url => {
    expect(() => bandcampSlug(url)).toThrow();
  });
  it("extracts a canonical slug", () => expect(bandcampSlug("https://artist-name.bandcamp.com/music")).toBe("artist-name"));
  it("rejects malicious legacy stored IDs before network access", async () => {
    await expect(fetchBandcampPage("evil.example/redirect?x=")).rejects.toThrow();
  });
});
describe("audio outbound destinations", () => {
  it.each(["http://127.0.0.1/health", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://2130706433/", "file:///etc/passwd"])("blocks %s", async url => {
    await expect(safeFetchBuffer(url)).rejects.toThrow();
  });
});