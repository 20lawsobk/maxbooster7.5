import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  Pkcs10CertificateRequest,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  X509CertificateGenerator,
} from "@peculiar/x509";
import {
  acmeJwsAlgorithm,
  acmeJwk,
  createAcmeAccountKey,
  createCertificateRequest,
  dns01RecordValue,
  NativeAcmeClient,
  signAcmeJws,
} from "../../server/services/acmeCrypto.js";

const decodeBase64Url = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const encodeBase64Url = (value: Buffer | ArrayBuffer): string =>
  Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

interface CertificateFixture {
  pem: string;
  request: {
    privateKeyPem: string;
    csrDerBase64Url: string;
  };
}

async function createCertificateFixture(
  hostname: string,
): Promise<CertificateFixture> {
  const keys = (await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keys.privateKey);
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8)
    .toString("base64")
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END PRIVATE KEY-----`;
  const extensions = [
    new SubjectAlternativeNameExtension([
      { type: "dns", value: hostname },
    ]),
  ];
  const csr = await Pkcs10CertificateRequestGenerator.create(
    {
      name: `CN=${hostname}`,
      extensions,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      keys,
    },
    webcrypto as unknown as Crypto,
  );
  const certificate = await X509CertificateGenerator.createSelfSigned(
    {
      name: `CN=${hostname}`,
      extensions,
      keys,
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 86_400_000),
    },
    webcrypto as unknown as Crypto,
  );
  return {
    pem: certificate.toString("pem"),
    request: {
      privateKeyPem,
      csrDerBase64Url: encodeBase64Url(csr.rawData),
    },
  };
}

function jsonResponse(
  value: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

interface FakeAcmeOptions {
  accountKeyPem: string;
  certificatePem: string;
  badNonceOnce?: boolean;
  authorizationStatus?: "pending" | "invalid";
  invalidOrder?: boolean;
  rejectChallenge?: boolean;
  challengeReady?: () => boolean;
}

function createFakeAcmeServer(options: FakeAcmeOptions): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; protectedHeader: Record<string, unknown> }>;
} {
  let nonceNumber = 0;
  let authzReads = 0;
  let orderReads = 0;
  let badNonceRejected = false;
  const calls: Array<{ url: string; protectedHeader: Record<string, unknown> }> =
    [];

  const fetchFn: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    if (url === "https://acme.test/directory") {
      return jsonResponse({
        newNonce: "https://acme.test/nonce",
        newAccount: "https://acme.test/account",
        newOrder: "https://acme.test/order",
      });
    }
    if (url === "https://acme.test/nonce") {
      return new Response(null, {
        status: 204,
        headers: { "replay-nonce": `nonce-${++nonceNumber}` },
      });
    }

    const body = JSON.parse(String(init.body)) as {
      protected: string;
      payload: string;
      signature: string;
    };
    const protectedHeader = JSON.parse(
      decodeBase64Url(body.protected).toString(),
    ) as Record<string, unknown>;
    calls.push({ url, protectedHeader });
    const signingInput = `${body.protected}.${body.payload}`;
    expect(
      verify(
        "sha256",
        Buffer.from(signingInput),
        protectedHeader.jwk
          ? {
              key: createPublicKey({
                key: protectedHeader.jwk as JsonWebKey,
                format: "jwk",
              }),
              dsaEncoding: "ieee-p1363",
            }
          : {
              key: createPublicKey(options.accountKeyPem),
              dsaEncoding: "ieee-p1363",
            },
        decodeBase64Url(body.signature),
      ),
    ).toBe(true);

    const replayNonce = { "replay-nonce": `nonce-${++nonceNumber}` };
    if (url.endsWith("/account")) {
      expect(protectedHeader.jwk).toBeDefined();
      if (options.badNonceOnce && !badNonceRejected) {
        badNonceRejected = true;
        return jsonResponse(
          {
            type: "urn:ietf:params:acme:error:badNonce",
            detail: "nonce rejected",
          },
          replayNonce,
          400,
        );
      }
      return jsonResponse(
        { status: "valid" },
        { ...replayNonce, location: "https://acme.test/acct/1" },
      );
    }
    expect(protectedHeader.kid).toBe("https://acme.test/acct/1");
    if (url === "https://acme.test/order" || url.endsWith("/order/1")) {
      if (body.payload) {
        const payload = JSON.parse(decodeBase64Url(body.payload).toString());
        if (payload.identifiers) {
          return jsonResponse(
            {
              status: "pending",
              authorizations: ["https://acme.test/authz/1"],
              finalize: "https://acme.test/finalize/1",
            },
            { ...replayNonce, location: "https://acme.test/order/1" },
          );
        }
      }
      orderReads++;
      if (options.invalidOrder) {
        return jsonResponse(
          {
            status: "invalid",
            authorizations: ["https://acme.test/authz/1"],
            finalize: "https://acme.test/finalize/1",
          },
          replayNonce,
        );
      }
      return jsonResponse(
        orderReads === 1
          ? {
              status: "ready",
              authorizations: ["https://acme.test/authz/1"],
              finalize: "https://acme.test/finalize/1",
            }
          : {
              status: "valid",
              authorizations: ["https://acme.test/authz/1"],
              finalize: "https://acme.test/finalize/1",
              certificate: "https://acme.test/cert/1",
            },
        replayNonce,
      );
    }
    if (url.endsWith("/authz/1")) {
      authzReads++;
      if (options.authorizationStatus === "invalid") {
        return jsonResponse(
          {
            status: "invalid",
            identifier: { type: "dns", value: "shop.example.test" },
            challenges: [],
          },
          replayNonce,
        );
      }
      return jsonResponse(
        authzReads === 1
          ? {
              status: "pending",
              identifier: { type: "dns", value: "shop.example.test" },
              challenges: [
                {
                  type: "dns-01",
                  url: "https://acme.test/challenge/1",
                  token: "challenge-token",
                  status: "pending",
                },
              ],
            }
          : {
              status: "valid",
              identifier: { type: "dns", value: "shop.example.test" },
              challenges: [],
            },
        replayNonce,
      );
    }
    if (url.endsWith("/challenge/1")) {
      expect(options.challengeReady?.() ?? true).toBe(true);
      if (options.rejectChallenge) {
        return jsonResponse(
          { type: "urn:ietf:params:acme:error:serverInternal" },
          replayNonce,
          400,
        );
      }
      return jsonResponse({}, replayNonce);
    }
    if (url.endsWith("/finalize/1")) {
      return jsonResponse(
        {
          status: "processing",
          authorizations: [],
          finalize: "https://acme.test/finalize/1",
        },
        replayNonce,
      );
    }
    if (url.endsWith("/cert/1")) {
      return new Response(options.certificatePem, {
        status: 200,
        headers: replayNonce,
      });
    }
    throw new Error(`Unexpected ACME request: ${url}`);
  };

  return { fetchFn, calls };
}

function createFakeDnsResolver(
  visibleAfterChecks: number,
): {
  resolverFactory: NonNullable<
    ConstructorParameters<typeof NativeAcmeClient>[0]["dnsResolverFactory"]
  >;
  publish: (recordValue: string) => void;
  txtLookups: string[];
} {
  let publishedValue: string | undefined;
  let lookupCount = 0;
  const txtLookups: string[] = [];
  const resolverFactory: NonNullable<
    ConstructorParameters<typeof NativeAcmeClient>[0]["dnsResolverFactory"]
  > = (options) => {
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.tries).toBe(1);
    let servers: string[] = [];
    return {
      setServers(value: string[]) {
        servers = value;
      },
      async resolveNs(hostname: string) {
        if (hostname === "example.test") {
          return ["ns1.example.test.", "ns2.example.test."];
        }
        throw new Error("no zone NS at this label");
      },
      async resolve4(hostname: string) {
        if (hostname === "ns1.example.test") return ["192.0.2.1"];
        if (hostname === "ns2.example.test") return ["192.0.2.2"];
        throw new Error(`Unexpected nameserver ${hostname}`);
      },
      async resolve6() {
        return [];
      },
      async resolveTxt(hostname: string) {
        expect(hostname).toBe("_acme-challenge.shop.example.test");
        expect(servers).toHaveLength(1);
        txtLookups.push(servers[0]);
        lookupCount++;
        if (!publishedValue || lookupCount <= visibleAfterChecks * 2) {
          return [];
        }
        return [[publishedValue.slice(0, 13), publishedValue.slice(13)]];
      },
    };
  };
  return {
    resolverFactory,
    publish: (recordValue) => {
      publishedValue = recordValue;
    },
    txtLookups,
  };
}

function fastDnsOptions(
  dns: ReturnType<typeof createFakeDnsResolver>,
): Pick<
  ConstructorParameters<typeof NativeAcmeClient>[0],
  "dnsResolverFactory" | "dnsPropagationOptions"
> {
  return {
    dnsResolverFactory: dns.resolverFactory,
    dnsPropagationOptions: {
      attempts: 2,
      intervalMs: 1,
      resolverTimeoutMs: 20,
    },
  };
}

describe("native ACME crypto helpers", () => {
  it("creates an ECDSA account key and verifiable JWS signature", () => {
    const key = createAcmeAccountKey();
    const input = "protected.payload";
    const signature = signAcmeJws(key, input);
    const publicKey = createPublicKey(key);

    expect(acmeJwsAlgorithm(key)).toBe("ES256");
    expect(acmeJwk(key)).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(
      verify(
        "sha256",
        Buffer.from(input),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        decodeBase64Url(signature),
      ),
    ).toBe(true);
  });

  it("keeps existing RSA ACME account keys usable", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const signature = signAcmeJws(key, "protected.payload");

    expect(acmeJwsAlgorithm(key)).toBe("RS256");
    expect(acmeJwk(key).kty).toBe("RSA");
    expect(
      verify(
        "sha256",
        Buffer.from("protected.payload"),
        createPublicKey(key),
        decodeBase64Url(signature),
      ),
    ).toBe(true);
  });

  it("creates a signed PKCS#10 request with DNS SAN and matching private key", async () => {
    const request = await createCertificateRequest("shop.example.test");
    const csr = new Pkcs10CertificateRequest(
      decodeBase64Url(request.csrDerBase64Url),
    );

    expect(await csr.verify(webcrypto as unknown as Crypto)).toBe(true);
    expect(csr.subject).toContain("shop.example.test");
    expect(csr.getExtension("2.5.29.17")).not.toBeNull();
    expect(request.privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  it("computes the RFC 8555 DNS-01 TXT digest", () => {
    expect(
      dns01RecordValue("abc.def"),
    ).toBe("67MSe_XHxLTkK1FxD0lGwcHQWzMdI3ndFeOlQx7ZNBY");
  });
});

describe("NativeAcmeClient RFC 8555 lifecycle", () => {
  it("waits for each authoritative NS, retries badNonce, and downloads a real certificate", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const dns = createFakeDnsResolver(3);
    const { fetchFn, calls } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
      badNonceOnce: true,
      challengeReady: () => dns.txtLookups.length >= 8,
    });

    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => fixture.request,
      dnsResolverFactory: dns.resolverFactory,
      dnsPropagationOptions: {
        attempts: 5,
        intervalMs: 1,
        resolverTimeoutMs: 20,
      },
    });
    const accountUrl = await client.registerAccount("admin@example.test");
    const created: Array<{ host: string; recordName: string; recordValue: string }> =
      [];
    const removed: Array<{ host: string; recordName: string; recordValue: string }> =
      [];
    const issued = await client.issueCertificate(
      "shop.example.test",
      async (challenge) => {
        created.push(challenge);
        dns.publish(challenge.recordValue);
      },
      async (challenge) => void removed.push(challenge),
    );

    expect(accountUrl).toBe("https://acme.test/acct/1");
    expect(client.getAccountUrl()).toBe(accountUrl);
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual(removed[0]);
    expect(created[0].recordName).toBe("_acme-challenge.shop.example.test");
    expect(created[0].recordValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(dns.txtLookups).toEqual([
      "192.0.2.1",
      "192.0.2.2",
      "192.0.2.1",
      "192.0.2.2",
      "192.0.2.1",
      "192.0.2.2",
      "192.0.2.1",
      "192.0.2.2",
    ]);
    expect(issued.certificatePem).toContain("BEGIN CERTIFICATE");
    expect(issued.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(calls.every((call) => call.protectedHeader.alg === "ES256")).toBe(
      true,
    );
    expect(calls.some((call) => call.url.endsWith("/cert/1"))).toBe(true);
    const accountCalls = calls.filter((call) =>
      call.url.endsWith("/account"),
    );
    expect(accountCalls).toHaveLength(2);
    expect(accountCalls[0].protectedHeader.nonce).not.toBe(
      accountCalls[1].protectedHeader.nonce,
    );
    expect(
      new Set(calls.map((call) => call.protectedHeader.nonce)).size,
    ).toBe(calls.length);
  });

  it("resolves a persisted account hint against the current directory with its key", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const { fetchFn, calls } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://other-directory.test/acct/old",
      fetchFn,
    });

    await expect(client.registerAccount("admin@example.test")).resolves.toBe(
      "https://acme.test/acct/1",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].protectedHeader.jwk).toBeDefined();
    expect(calls[0].protectedHeader.kid).toBeUndefined();
  });

  it("rejects an invalid authorization before publishing DNS", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const { fetchFn } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
      authorizationStatus: "invalid",
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://acme.test/acct/1",
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => fixture.request,
    });
    await client.registerAccount("admin@example.test");
    const create = vi.fn(async () => {});
    const remove = vi.fn(async () => {});

    await expect(
      client.issueCertificate("shop.example.test", create, remove),
    ).rejects.toThrow("ACME authorization is invalid");
    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("never signals a challenge ready when authoritative TXT visibility times out", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const dns = createFakeDnsResolver(100);
    const { fetchFn, calls } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
      challengeReady: () => false,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => fixture.request,
      dnsResolverFactory: dns.resolverFactory,
      dnsPropagationOptions: {
        attempts: 3,
        intervalMs: 1,
        resolverTimeoutMs: 20,
      },
    });
    await client.registerAccount("admin@example.test");
    const remove = vi.fn(async () => {});

    await expect(
      client.issueCertificate(
        "shop.example.test",
        async (challenge) => dns.publish(challenge.recordValue),
        remove,
      ),
    ).rejects.toThrow("did not become visible on every authoritative nameserver");
    expect(dns.txtLookups).toHaveLength(6);
    expect(calls.some((call) => call.url.endsWith("/challenge/1"))).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("rejects an invalid order and has already cleaned the DNS challenge", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const dns = createFakeDnsResolver(0);
    const { fetchFn } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
      invalidOrder: true,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://acme.test/acct/1",
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => fixture.request,
      ...fastDnsOptions(dns),
    });
    await client.registerAccount("admin@example.test");
    const create = vi.fn(async () => {});
    const remove = vi.fn(async () => {});

    await expect(
      client.issueCertificate(
        "shop.example.test",
        async (challenge) => {
          create();
          dns.publish(challenge.recordValue);
        },
        remove,
      ),
    ).rejects.toThrow("ACME order became invalid");
    expect(create).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("cleans DNS after a challenge request failure and preserves that original error", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const fixture = await createCertificateFixture("shop.example.test");
    const dns = createFakeDnsResolver(0);
    const { fetchFn } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: fixture.pem,
      rejectChallenge: true,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://acme.test/acct/1",
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => fixture.request,
      ...fastDnsOptions(dns),
    });
    await client.registerAccount("admin@example.test");
    const cleanupError = new Error("database cleanup failed");
    const remove = vi.fn(async () => {
      throw cleanupError;
    });

    const originalError = await client
      .issueCertificate(
        "shop.example.test",
        async (challenge) => dns.publish(challenge.recordValue),
        remove,
      )
      .catch((error: Error) => error);
    expect(originalError.message).toContain("ACME request failed (400)");
    expect(originalError.cleanupError).toBe(cleanupError);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("rejects a certificate for another hostname", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const matchingKey = await createCertificateFixture("shop.example.test");
    const wrongHost = await createCertificateFixture("other.example.test");
    const dns = createFakeDnsResolver(0);
    const { fetchFn } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: wrongHost.pem,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://acme.test/acct/1",
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => matchingKey.request,
      ...fastDnsOptions(dns),
    });
    await client.registerAccount("admin@example.test");

    await expect(
      client.issueCertificate(
        "shop.example.test",
        async (challenge) => dns.publish(challenge.recordValue),
        async () => {},
      ),
    ).rejects.toThrow("does not contain a DNS SAN");
  });

  it("rejects a certificate whose public key differs from the CSR key", async () => {
    const accountKeyPem = createAcmeAccountKey();
    const requested = await createCertificateFixture("shop.example.test");
    const wrongKey = await createCertificateFixture("shop.example.test");
    const dns = createFakeDnsResolver(0);
    const { fetchFn } = createFakeAcmeServer({
      accountKeyPem,
      certificatePem: wrongKey.pem,
    });
    const client = new NativeAcmeClient({
      directoryUrl: "https://acme.test/directory",
      accountKeyPem,
      accountUrl: "https://acme.test/acct/1",
      fetchFn,
      waitFn: async () => {},
      createCertificateRequestFn: async () => requested.request,
      ...fastDnsOptions(dns),
    });
    await client.registerAccount("admin@example.test");

    await expect(
      client.issueCertificate(
        "shop.example.test",
        async (challenge) => dns.publish(challenge.recordValue),
        async () => {},
      ),
    ).rejects.toThrow("public key does not match");
  });
});