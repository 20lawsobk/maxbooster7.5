import { describe, expect, it, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("dns", () => ({lookup}));
import { safeFetchBuffer } from "../../server/services/safeUrlFetch";

describe("connect-time DNS rebinding boundary", () => {
  it.each([
    ["127.0.0.1",4], ["169.254.169.254",4], ["192.168.1.10",4],
    ["0:0:0:0:0:0:0:1",6], ["::ffff:127.0.0.1",6],
    ["fc00::1",6], ["fe80::1",6], ["198.18.0.1",4], ["224.0.0.1",4],
  ])("rejects a public hostname resolving to %s", async (address, family) => {
    lookup.mockImplementation((_host, _opts, callback) =>
      callback(null,[{address,family}]));
    await expect(safeFetchBuffer("http://attacker.example/audio")).rejects.toThrow(/SSRF blocked/);
  });
  it("rejects mixed public/private answers rather than selecting the public one", async () => {
    lookup.mockImplementation((_host, _opts, callback) => callback(null,[
      {address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4},
    ]));
    await expect(safeFetchBuffer("http://attacker.example/audio")).rejects.toThrow(/SSRF blocked/);
  });
  it("fails explicitly on an empty DNS result", async () => {
    lookup.mockImplementation((_host, _opts, callback) => callback(null,[]));
    await expect(safeFetchBuffer("http://attacker.example/audio")).rejects.toThrow(/no addresses/);
  });
});