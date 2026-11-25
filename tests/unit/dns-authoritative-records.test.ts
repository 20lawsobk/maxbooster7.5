import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  databaseError: false,
  select: vi.fn(),
  resolveGeoIP: vi.fn(),
}));

vi.mock("../../server/db.js", () => ({
  db: { select: mocks.select },
}));

vi.mock("../../server/services/geoDns.js", () => ({
  resolveGeoIP: mocks.resolveGeoIP,
  getGeoDnsStatus: () => ({ enabled: false, regionMap: {} }),
}));

import dns2 from "dns2";
import { handleDnsRequest } from "../../server/services/dnsServer.js";

const Packet = (dns2 as any).Packet;
const BASE_DOMAIN = process.env.BASE_DOMAIN || "max-booster.com";

function dnsRequest(name: string, type: number) {
  return {
    header: { id: 71, opcode: 0, rd: 1 },
    questions: [{ name, type, class: Packet.CLASS.IN }],
  };
}

async function ask(name: string, type: number) {
  let response: Record<string, any> | undefined;
  await handleDnsRequest(dnsRequest(name, type), (value) => {
    response = value;
  });
  if (!response) throw new Error("The authoritative DNS handler did not reply.");
  return response;
}

describe("authoritative DNS configured records", () => {
  beforeEach(() => {
    mocks.records = [];
    mocks.databaseError = false;
    mocks.resolveGeoIP.mockReset().mockResolvedValue("192.0.2.200");
    mocks.select.mockReset().mockImplementation(() => ({
      from: () => {
        const query = {
          innerJoin: () => query,
          where: () =>
            mocks.databaseError
              ? Promise.reject(new Error("database unavailable"))
              : Promise.resolve(mocks.records),
        };
        return query;
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves stored A records before applying GeoDNS", async () => {
    mocks.records = [
      { value: "192.0.2.10", ttl: 120 },
      { value: "192.0.2.11", ttl: 240 },
    ];

    const response = await ask(`media.${BASE_DOMAIN}`, Packet.TYPE.A);

    expect(response.header.rcode).toBe(0);
    expect(response.answers).toEqual([
      expect.objectContaining({
        name: `media.${BASE_DOMAIN}`,
        type: Packet.TYPE.A,
        address: "192.0.2.10",
        ttl: 120,
      }),
      expect.objectContaining({
        name: `media.${BASE_DOMAIN}`,
        type: Packet.TYPE.A,
        address: "192.0.2.11",
        ttl: 240,
      }),
    ]);
    expect(mocks.resolveGeoIP).not.toHaveBeenCalled();
  });

  it("keeps GeoDNS as the answer only when no explicit A record exists", async () => {
    const response = await ask(`media.${BASE_DOMAIN}`, Packet.TYPE.A);

    expect(response.answers[0]).toMatchObject({
      name: `media.${BASE_DOMAIN}`,
      address: "192.0.2.200",
    });
    expect(mocks.resolveGeoIP).toHaveBeenCalledOnce();
  });

  it("returns SERVFAIL rather than masking malformed A records with GeoDNS", async () => {
    mocks.records = [{ value: "invalid.example", ttl: 60 }];

    const response = await ask(`media.${BASE_DOMAIN}`, Packet.TYPE.A);

    expect(response.header.rcode).toBe(2);
    expect(response.answers).toHaveLength(0);
    expect(mocks.resolveGeoIP).not.toHaveBeenCalled();
  });

  it("returns SERVFAIL rather than masking a zone-store read failure", async () => {
    mocks.databaseError = true;

    const response = await ask(`media.${BASE_DOMAIN}`, Packet.TYPE.A);

    expect(response.header.rcode).toBe(2);
    expect(response.answers).toHaveLength(0);
    expect(mocks.resolveGeoIP).not.toHaveBeenCalled();
  });

  it("serves stored SRV records with RFC priority, weight, port, and target", async () => {
    mocks.records = [
      {
        value: "media-us.example.test.",
        ttl: 60,
        priority: 10,
        weight: 20,
        port: 4443,
      },
    ];

    const response = await ask(
      `_maxcore-media._tcp.${BASE_DOMAIN}`,
      Packet.TYPE.SRV,
    );
    const encoded = Packet.Resource.encode(response.answers[0]);
    const decoded = Packet.Resource.decode(new Packet.Reader(encoded));

    expect(decoded).toMatchObject({
      name: `_maxcore-media._tcp.${BASE_DOMAIN}`,
      type: Packet.TYPE.SRV,
      priority: 10,
      weight: 20,
      port: 4443,
      target: "media-us.example.test",
    });
  });

  it("fails closed for malformed SRV records and database errors", async () => {
    mocks.records = [
      {
        value: "bad host.example.test",
        ttl: 60,
        priority: 0,
        weight: 0,
        port: 443,
      },
    ];
    const malformed = await ask(
      `_maxcore-media._tcp.${BASE_DOMAIN}`,
      Packet.TYPE.SRV,
    );
    expect(malformed.header.rcode).toBe(2);
    expect(malformed.answers).toHaveLength(0);

    mocks.databaseError = true;
    const unavailable = await ask(
      `_maxcore-media._tcp.${BASE_DOMAIN}`,
      Packet.TYPE.SRV,
    );
    expect(unavailable.header.rcode).toBe(2);
    expect(unavailable.answers).toHaveLength(0);
  });
});
