/**
 * Unit tests for the SSRF guard primitives in server/services/safeUrlFetch.ts.
 *
 * These are the gatekeepers every attacker-influenced outbound URL passes
 * through (the advanced URL parser, autopilot link enrichment, the manual
 * URL→content route). They are pure, dependency-free functions, so we exercise
 * them directly — no network, no mocks. The connect-time DNS lookup (the
 * authoritative DNS-rebinding guard) is intentionally NOT covered here; this
 * locks in the literal-host / scheme / credential rejection contract.
 */
import { describe, it, expect } from "vitest";
import {
  assertPublicHttpUrl,
  isReservedIp,
} from "../../server/services/safeUrlFetch.js";

describe("isReservedIp", () => {
  it.each([
    "127.0.0.1",
    "127.5.6.7",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.20.5.5",
    "172.31.255.255",
    "169.254.169.254", // link-local / cloud metadata endpoint
    "100.64.0.1", // CGNAT
    "100.127.0.1",
    "0.0.0.0",
    "0.1.2.3", // 0.0.0.0/8 reserved
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1", // IPv4-mapped private
    "[::1]", // bracket-quoted IPv6
    "localhost",
  ])("treats %s as reserved", (ip) => {
    expect(isReservedIp(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1", // just below the 172.16/12 private block
    "172.32.0.1", // just above it
    "100.63.0.1", // just below CGNAT
    "100.128.0.1", // just above CGNAT
    "::ffff:8.8.8.8", // IPv4-mapped PUBLIC address
    "2606:4700:4700::1111", // public IPv6
  ])("treats %s as public", (ip) => {
    expect(isReservedIp(ip)).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1",
    "https://sub.domain.co.uk/resource",
    "https://8.8.8.8/", // public IP literal is allowed
  ])("returns a URL for the public http(s) url %s", (url) => {
    const u = assertPublicHttpUrl(url);
    expect(u).toBeInstanceOf(URL);
    expect(u.href).toContain(new URL(url).hostname);
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => assertPublicHttpUrl("ftp://example.com")).toThrow(
      /http and https/i,
    );
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    // eslint-disable-next-line no-script-url -- test fixture asserting rejection, never executed
    expect(() => assertPublicHttpUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => assertPublicHttpUrl("http://user:pass@example.com")).toThrow(
      /credentials/i,
    );
    expect(() => assertPublicHttpUrl("https://user@example.com")).toThrow(
      /credentials/i,
    );
  });

  it.each([
    "http://localhost",
    "http://localhost:3000",
    "http://app.localhost",
    "http://service.local",
    "http://svc.internal",
  ])("rejects internal hostname %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow(/blocked host/i);
  });

  it.each([
    "http://127.0.0.1",
    "http://10.0.0.5",
    "http://192.168.0.1",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("rejects private/reserved host %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow(/blocked host/i);
  });

  it.each(["not a url", "", "://missing-scheme"])(
    "rejects the unparseable url %j",
    (url) => {
      expect(() => assertPublicHttpUrl(url)).toThrow(/invalid url/i);
    },
  );
});
