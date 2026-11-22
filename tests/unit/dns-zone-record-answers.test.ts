import { describe, expect, it } from "vitest";
import dns2 from "dns2";
import {
  isValidIpv4Address,
  isValidSrvTarget,
  mapAZoneRecords,
  mapSrvZoneRecords,
} from "../../server/services/dnsZoneRecordAnswers.js";

const { Packet } = dns2 as any;

describe("built-in authoritative DNS zone answers", () => {
  it("uses strict IPv4 validation for configured A records", () => {
    expect(isValidIpv4Address("192.0.2.16")).toBe(true);
    expect(isValidIpv4Address("256.0.2.16")).toBe(false);
    expect(isValidIpv4Address("192.000.2.16")).toBe(false);
    expect(isValidIpv4Address("2001:db8::1")).toBe(false);
  });

  it("maps each configured A record and preserves its TTL", () => {
    expect(
      mapAZoneRecords("media.example.test", [
        { value: "192.0.2.10", ttl: 120 },
        { value: "192.0.2.11", ttl: 240 },
      ]),
    ).toEqual({
      answers: [
        { name: "media.example.test", value: "192.0.2.10", ttl: 120 },
        { name: "media.example.test", value: "192.0.2.11", ttl: 240 },
      ],
      invalidRecord: false,
    });
  });

  it("does not turn malformed configured A data into a GeoDNS fallback", () => {
    expect(
      mapAZoneRecords("media.example.test", [
        { value: "not-an-ip", ttl: 60 },
      ]),
    ).toEqual({ answers: [], invalidRecord: true });
  });

  it("rejects malformed stored TTLs instead of silently substituting one", () => {
    expect(
      mapAZoneRecords("media.example.test", [
        { value: "192.0.2.10", ttl: -1 },
      ]),
    ).toEqual({ answers: [], invalidRecord: true });
  });

  it("validates SRV targets, including the RFC service-unavailable target", () => {
    expect(isValidSrvTarget("media.example.test")).toBe(true);
    expect(isValidSrvTarget("media.example.test.")).toBe(true);
    expect(isValidSrvTarget("média.example.test")).toBe(true);
    expect(isValidSrvTarget(".")).toBe(true);
    expect(isValidSrvTarget("bad target.example.test")).toBe(false);
    expect(isValidSrvTarget("bad..example.test")).toBe(false);
    expect(isValidSrvTarget("-bad.example.test")).toBe(false);
  });

  it("maps SRV priority, weight, port, target, and TTL into wire fields", () => {
    const [record] = mapSrvZoneRecords("_maxcore-media._tcp.example.test", [
      {
        value: "media-us.example.test.",
        ttl: 60,
        priority: 10,
        weight: 20,
        port: 4443,
      },
    ]).answers;

    const encoded = Packet.Resource.encode({
      name: record.name,
      type: Packet.TYPE.SRV,
      class: Packet.CLASS.IN,
      ttl: record.ttl,
      priority: record.priority,
      weight: record.weight,
      port: record.port,
      target: record.value,
    });
    const decoded = Packet.Resource.decode(new Packet.Reader(encoded));

    expect(decoded).toMatchObject({
      name: "_maxcore-media._tcp.example.test",
      type: Packet.TYPE.SRV,
      priority: 10,
      weight: 20,
      port: 4443,
      target: "media-us.example.test",
    });
  });

  it("converts internationalized SRV targets to wire-safe ASCII", () => {
    expect(
      mapSrvZoneRecords("service.example.test", [
        {
          value: "média.example.test",
          ttl: 60,
          priority: 0,
          weight: 0,
          port: 443,
        },
      ]).answers[0].value,
    ).toBe("xn--mdia-bpa.example.test");
  });

  it("fails closed for incomplete or out-of-range SRV records", () => {
    expect(
      mapSrvZoneRecords("service.example.test", [
        {
          value: "media.example.test",
          ttl: 60,
          priority: 1,
          weight: 1,
          port: 65_536,
        },
      ]),
    ).toEqual({ answers: [], invalidRecord: true });
  });
});
