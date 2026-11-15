import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  hasDatabase: vi.fn(),
}));

vi.mock("../../dns-os/services/dns-api/src/db/pool.js", () => ({
  pool: {
    query: mocks.query,
    connect: mocks.connect,
  },
  schema: "dns_os",
  hasDnsApiDatabaseConfiguration: mocks.hasDatabase,
}));

import {
  createDnsApiApp,
  dnsApiDatabaseReady,
} from "../../dns-os/services/dns-api/src/index.js";

const TOKEN = "dns-api-test-token-".padEnd(40, "x");

describe("DNS API isolated schema access", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.connect.mockReset();
    mocks.hasDatabase.mockReset().mockReturnValue(true);
  });

  it("checks fully qualified required tables without depending on session search_path", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ tenants: "tenants", zones: "zones", records: "records", audit_log: "audit_log" }],
    });

    await expect(dnsApiDatabaseReady()).resolves.toBe(true);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("to_regclass($1)"),
      ["dns_os.tenants", "dns_os.zones", "dns_os.records", "dns_os.audit_log"],
    );
    expect(mocks.query.mock.calls[0][0]).not.toContain("current_schema()");
  });

  it("keeps readiness blocked when a required namespaced table is missing", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ tenants: "tenants", zones: "zones", records: null, audit_log: "audit_log" }],
    });

    await expect(dnsApiDatabaseReady()).resolves.toBe(false);
  });

  it.each([
    ["/tenants", "FROM dns_os.tenants"],
    ["/zones", "FROM dns_os.zones"],
    ["/zones/00000000-0000-0000-0000-000000000001/records", "FROM dns_os.records"],
  ])("routes %s through its isolated schema", async (url, expectedSql) => {
    mocks.query.mockResolvedValue({ rows: [] });
    const app = createDnsApiApp({ token: TOKEN, logger: false });

    try {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.query.mock.calls[0][0]).toContain(expectedSql);
    } finally {
      await app.close();
    }
  });

  it("qualifies record writes and the atomic serial increment", async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    });
    const app = createDnsApiApp({ token: TOKEN, logger: false });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/zones/00000000-0000-0000-0000-000000000001/records",
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: { name: "www", type: "A", data: "192.0.2.1" },
      });
      expect(response.statusCode).toBe(201);
      const statements = clientQuery.mock.calls.map(([sql]) => String(sql));
      expect(statements[0]).toBe("BEGIN");
      expect(statements[1]).toContain("INSERT INTO dns_os.records");
      expect(statements[2]).toContain("UPDATE dns_os.zones");
      expect(statements[2]).toContain("serial = serial + 1");
      expect(statements[3]).toBe("COMMIT");
    } finally {
      await app.close();
    }
  });
});
