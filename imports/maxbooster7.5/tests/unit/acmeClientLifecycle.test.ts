import { describe, expect, it } from "vitest";
import { createAcmeAccountKey } from "../../server/services/acmeCrypto.js";
import { createAcmeClientProvider } from "../../server/services/acmeClientLifecycle.js";

function directoryTransport(directory: string, account: string, failFirst = false) {
  let directoryCalls = 0;
  let accountCalls = 0;
  let nonce = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === directory) {
      directoryCalls++;
      if (failFirst && directoryCalls === 1) throw new Error("temporary directory failure");
      return Response.json({
        newNonce: `${directory}/nonce`,
        newAccount: `${directory}/account`,
        newOrder: `${directory}/order`,
      });
    }
    if (url.endsWith("/nonce")) {
      return new Response(null, { status: 204, headers: { "replay-nonce": `nonce-${++nonce}` } });
    }
    if (url.endsWith("/account")) {
      accountCalls++;
      const signed = JSON.parse(String(init?.body));
      const header = JSON.parse(Buffer.from(signed.protected, "base64url").toString());
      expect(header.url).toBe(`${directory}/account`);
      expect(header.jwk).toMatchObject({ kty: "EC" });
      expect(header.kid).toBeUndefined();
      return Response.json({ status: "valid" }, {
        status: 201, headers: { location: account, "replay-nonce": `nonce-${++nonce}` },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  return { fetchFn, get directoryCalls() { return directoryCalls; }, get accountCalls() { return accountCalls; } };
}

describe("ACME initialized-client cache", () => {
  it("retries after first-request failure instead of caching an unregistered client", async () => {
    const transport = directoryTransport("https://staging.test/directory", "https://staging.test/account/1", true);
    const key = createAcmeAccountKey();
    const stored: string[] = [];
    let keyLoads = 0;
    const getClient = createAcmeClientProvider({
      directoryUrl: "https://staging.test/directory",
      contactEmail: "acme@example.test",
      loadAccountKey: async () => { keyLoads++; return key; },
      persistAccountUrl: async url => { stored.push(url); },
      fetchFn: transport.fetchFn,
    });
    await expect(getClient()).rejects.toThrow("temporary directory failure");
    expect(stored).toEqual([]);
    const retried = await getClient();
    expect(retried.getAccountUrl()).toBe("https://staging.test/account/1");
    expect(await getClient()).toBe(retried);
    expect(transport.directoryCalls).toBe(2);
    expect(transport.accountCalls).toBe(1);
    expect(keyLoads).toBe(2);
  });

  it("shares a pending initialization and publishes only after account URL persistence", async () => {
    const transport = directoryTransport("https://acme.test/directory", "https://acme.test/account/1");
    const key = createAcmeAccountKey();
    let keyLoads = 0;
    let releasePersistence!: () => void;
    const saved = new Promise<void>(resolve => { releasePersistence = resolve; });
    let didSave!: () => void;
    const saving = new Promise<void>(resolve => { didSave = resolve; });
    const getClient = createAcmeClientProvider({
      directoryUrl: "https://acme.test/directory",
      contactEmail: "acme@example.test",
      loadAccountKey: async () => { keyLoads++; return key; },
      persistAccountUrl: async () => { didSave(); await saved; },
      fetchFn: transport.fetchFn,
    });
    const first = getClient();
    const second = getClient();
    await saving;
    let returned = false;
    void first.then(() => { returned = true; });
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(keyLoads).toBe(1);
    releasePersistence();
    expect(await first).toBe(await second);
    expect(transport.accountCalls).toBe(1);
  });

  it("retrieves an account for the new directory using the same key after switching from staging", async () => {
    const key = createAcmeAccountKey();
    let storedGlobalUrl = "https://staging.test/account/old";
    for (const environment of ["staging", "production"]) {
      const directory = `https://${environment}.test/directory`;
      const account = `https://${environment}.test/account/1`;
      const transport = directoryTransport(directory, account);
      const getClient = createAcmeClientProvider({
        directoryUrl: directory,
        contactEmail: "acme@example.test",
        loadAccountKey: async () => key,
        persistAccountUrl: async url => { storedGlobalUrl = url; },
        fetchFn: transport.fetchFn,
      });
      expect((await getClient()).getAccountUrl()).toBe(account);
      expect(storedGlobalUrl).toBe(account);
      expect(transport.accountCalls).toBe(1);
    }
  });

  it("retries when account URL persistence fails", async () => {
    const transport = directoryTransport("https://acme.test/directory", "https://acme.test/account/1");
    const key = createAcmeAccountKey();
    let saves = 0;
    const getClient = createAcmeClientProvider({
      directoryUrl: "https://acme.test/directory",
      contactEmail: "acme@example.test",
      loadAccountKey: async () => key,
      persistAccountUrl: async () => { if (++saves === 1) throw new Error("temporary database failure"); },
      fetchFn: transport.fetchFn,
    });
    await expect(getClient()).rejects.toThrow("temporary database failure");
    expect((await getClient()).getAccountUrl()).toBe("https://acme.test/account/1");
    expect(transport.accountCalls).toBe(2);
  });
});