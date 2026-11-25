import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  timingSafeEqual,
  X509Certificate as NodeX509Certificate,
} from "node:crypto";
import { Resolver } from "node:dns/promises";
import type { ResolverOptions } from "node:dns";
import type { KeyObject } from "node:crypto";
import { webcrypto } from "node:crypto";
import {
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
} from "@peculiar/x509";

const BASE64URL = (value: Buffer | ArrayBuffer): string =>
  Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BAD_NONCE_RETRIES = 2;
const DNS_PROPAGATION_DEFAULTS: DnsPropagationOptions = {
  attempts: 20,
  intervalMs: 3_000,
  resolverTimeoutMs: 2_000,
};

export interface DnsResolver {
  setServers(servers: string[]): void;
  resolveNs(hostname: string): Promise<string[]>;
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}

export type DnsResolverFactory = (
  options: ResolverOptions,
) => DnsResolver;

export interface DnsPropagationOptions {
  attempts: number;
  intervalMs: number;
  resolverTimeoutMs: number;
}

const nativeDnsResolverFactory: DnsResolverFactory = (options) =>
  new Resolver(options);

export function createAcmeAccountKey(): string {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

export type AcmeJwk =
  | { crv: string; kty: "EC"; x: string; y: string }
  | { e: string; kty: "RSA"; n: string };

export function acmeJwk(accountKeyPem: string): AcmeJwk {
  const privateKey = createPrivateKey(accountKeyPem);
  const jwk = createPublicKey(privateKey).export({
    format: "jwk",
  });
  if (
    privateKey.asymmetricKeyType === "ec" &&
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    jwk.x &&
    jwk.y
  ) {
    return { crv: jwk.crv, kty: "EC", x: jwk.x, y: jwk.y };
  }
  if (
    privateKey.asymmetricKeyType === "rsa" &&
    jwk.kty === "RSA" &&
    jwk.n &&
    jwk.e
  ) {
    return { e: jwk.e, kty: "RSA", n: jwk.n };
  }
  throw new Error("ACME account key must be ECDSA P-256 or RSA");
}

export function acmeJwkThumbprint(accountKeyPem: string): string {
  const jwk = acmeJwk(accountKeyPem);
  const canonical =
    jwk.kty === "EC"
      ? JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
      : JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return BASE64URL(createHash("sha256").update(canonical).digest());
}

export function dns01RecordValue(keyAuthorization: string): string {
  return BASE64URL(createHash("sha256").update(keyAuthorization).digest());
}

export function signAcmeJws(accountKeyPem: string, signingInput: string): string {
  const privateKey: KeyObject = createPrivateKey(accountKeyPem);
  return BASE64URL(
    sign(
      "sha256",
      Buffer.from(signingInput),
      privateKey.asymmetricKeyType === "ec"
        ? { key: privateKey, dsaEncoding: "ieee-p1363" }
        : privateKey,
    ),
  );
}

export function acmeJwsAlgorithm(accountKeyPem: string): "ES256" | "RS256" {
  return createPrivateKey(accountKeyPem).asymmetricKeyType === "ec"
    ? "ES256"
    : "RS256";
}

export interface CertificateRequest {
  privateKeyPem: string;
  csrDerBase64Url: string;
}

export async function createCertificateRequest(
  hostname: string,
): Promise<CertificateRequest> {
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
  const csr = await Pkcs10CertificateRequestGenerator.create(
    {
      name: `CN=${hostname}`,
      extensions: [
        new SubjectAlternativeNameExtension([
          { type: "dns", value: hostname },
        ]),
      ],
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      keys,
    },
    webcrypto as unknown as Crypto,
  );
  return {
    privateKeyPem,
    csrDerBase64Url: BASE64URL(csr.rawData),
  };
}

export interface AcmeAuthorization {
  identifier: { type: string; value: string };
  status: string;
  challenges: Array<{
    type: string;
    url: string;
    token: string;
    status: string;
  }>;
}

export interface Dns01Challenge {
  host: string;
  recordName: string;
  recordValue: string;
}

export interface NativeAcmeClientOptions {
  directoryUrl: string;
  accountKeyPem: string;
  accountUrl?: string;
  fetchFn?: typeof fetch;
  waitFn?: (milliseconds: number) => Promise<void>;
  createCertificateRequestFn?: typeof createCertificateRequest;
  dnsResolverFactory?: DnsResolverFactory;
  dnsPropagationOptions?: Partial<DnsPropagationOptions>;
}

interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
}

interface AcmeOrder {
  status: string;
  authorizations: string[];
  finalize: string;
  certificate?: string;
}

function payloadRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`ACME ${label} response must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requiredUrl(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`ACME ${label} response omitted a URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`ACME ${label} response contains an invalid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`ACME ${label} URL must use HTTPS`);
  }
  return value;
}

function parseAcmeDirectory(value: unknown): AcmeDirectory {
  const directory = payloadRecord(value, "directory");
  return {
    newNonce: requiredUrl(directory.newNonce, "newNonce"),
    newAccount: requiredUrl(directory.newAccount, "newAccount"),
    newOrder: requiredUrl(directory.newOrder, "newOrder"),
  };
}

function parseAcmeOrder(value: unknown): AcmeOrder {
  const order = payloadRecord(value, "order");
  const statuses = ["pending", "ready", "processing", "valid", "invalid"];
  if (typeof order.status !== "string" || !statuses.includes(order.status)) {
    throw new Error("ACME order response has an invalid status");
  }
  if (
    !Array.isArray(order.authorizations) ||
    !order.authorizations.every((url) => typeof url === "string")
  ) {
    throw new Error("ACME order response has invalid authorizations");
  }
  return {
    status: order.status,
    authorizations: order.authorizations.map((url) =>
      requiredUrl(url, "authorization"),
    ),
    finalize: requiredUrl(order.finalize, "finalize"),
    ...(order.certificate === undefined
      ? {}
      : { certificate: requiredUrl(order.certificate, "certificate") }),
  };
}

function parseAcmeAuthorization(value: unknown): AcmeAuthorization {
  const authz = payloadRecord(value, "authorization");
  if (
    typeof authz.status !== "string" ||
    !["pending", "valid", "invalid", "deactivated", "expired", "revoked"]
      .includes(authz.status) ||
    typeof authz.identifier !== "object" ||
    authz.identifier === null ||
    Array.isArray(authz.identifier)
  ) {
    throw new Error("ACME authorization response is malformed");
  }
  const identifier = authz.identifier as Record<string, unknown>;
  if (
    typeof identifier.type !== "string" ||
    typeof identifier.value !== "string" ||
    !Array.isArray(authz.challenges)
  ) {
    throw new Error("ACME authorization response is missing identifier or challenges");
  }
  const challenges = authz.challenges.map((value) => {
    const challenge = payloadRecord(value, "challenge");
    if (
      typeof challenge.type !== "string" ||
      typeof challenge.token !== "string" ||
      typeof challenge.status !== "string"
    ) {
      throw new Error("ACME challenge response is malformed");
    }
    return {
      type: challenge.type,
      url: requiredUrl(challenge.url, "challenge"),
      token: challenge.token,
      status: challenge.status,
    };
  });
  return {
    identifier: { type: identifier.type, value: identifier.value },
    status: authz.status,
    challenges,
  };
}

export class NativeAcmeClient {
  private readonly fetchFn: typeof fetch;
  private readonly waitFn: (milliseconds: number) => Promise<void>;
  private directoryPromise?: Promise<AcmeDirectory>;
  private nonce?: string;
  private accountUrl?: string;
  private accountResolved = false;
  private readonly jwk;

  constructor(private readonly options: NativeAcmeClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.waitFn =
      options.waitFn ?? ((milliseconds) => new Promise((r) => setTimeout(r, milliseconds)));
    // A persisted URL is only a hint, never authority: the same account key
    // may be used against a different ACME directory. Resolve it via
    // newAccount for this directory before using it as JWS `kid`.
    this.accountUrl = undefined;
    this.jwk = acmeJwk(options.accountKeyPem);
  }

  getAccountUrl(): string | undefined {
    return this.accountUrl;
  }

  async registerAccount(contactEmail: string): Promise<string> {
    if (this.accountResolved && this.accountUrl) return this.accountUrl;
    const directory = await this.directory();
    const response = await this.post(
      directory.newAccount,
      {
        contact: [`mailto:${contactEmail}`],
        termsOfServiceAgreed: true,
      },
      false,
    );
    const location = response.headers.get("location");
    if (!location) throw new Error("ACME new-account response omitted Location");
    requiredUrl(location, "account");
    this.accountUrl = location;
    this.accountResolved = true;
    return location;
  }

  async issueCertificate(
    hostname: string,
    onDnsChallengeCreate: (challenge: Dns01Challenge) => Promise<void>,
    onDnsChallengeRemove: (challenge: Dns01Challenge) => Promise<void>,
  ): Promise<{ certificatePem: string; privateKeyPem: string }> {
    if (!this.accountUrl) {
      throw new Error("ACME account is not registered");
    }
    const directory = await this.directory();
    const csr = await (this.options.createCertificateRequestFn ??
      createCertificateRequest)(hostname);
    const orderResponse = await this.post(
      directory.newOrder,
      { identifiers: [{ type: "dns", value: hostname }] },
      true,
    );
    const orderUrl = orderResponse.headers.get("location");
    if (!orderUrl) throw new Error("ACME new-order response omitted Location");
    requiredUrl(orderUrl, "order");
    let order = parseAcmeOrder(await this.responseJson(orderResponse));

    for (const authorizationUrl of order.authorizations) {
      await this.completeAuthorization(
        authorizationUrl,
        onDnsChallengeCreate,
        onDnsChallengeRemove,
      );
    }

    order = await this.pollOrder(orderUrl, (current) => current.status === "ready");
    const finalized = await this.post(order.finalize, { csr: csr.csrDerBase64Url }, true);
    order = parseAcmeOrder(await this.responseJson(finalized));
    order = await this.pollOrder(orderUrl, (current) => current.status === "valid");
    if (!order.certificate) {
      throw new Error("ACME completed order without a certificate URL");
    }
    const certificateResponse = await this.post(order.certificate, "", true);
    const certificatePem = (await certificateResponse.text()).trim();
    validateIssuedCertificate(certificatePem, csr.privateKeyPem, hostname);
    return {
      certificatePem,
      privateKeyPem: csr.privateKeyPem,
    };
  }

  private async directory(): Promise<AcmeDirectory> {
    if (!this.directoryPromise) {
      this.directoryPromise = this.fetchDirectory();
    }
    try {
      return await this.directoryPromise;
    } catch (error) {
      this.directoryPromise = undefined;
      throw error;
    }
  }

  private async fetchDirectory(): Promise<AcmeDirectory> {
    const response = await this.fetchFn(this.options.directoryUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`ACME directory request failed (${response.status})`);
    }
    return parseAcmeDirectory(await response.json());
  }

  private async post(
    url: string,
    payload: unknown,
    useAccount: boolean,
  ): Promise<Response> {
    const directory = await this.directory();
    const encodedPayload = encodeBase64Url(
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
    for (let attempt = 0; attempt <= MAX_BAD_NONCE_RETRIES; attempt++) {
      const protectedHeader: Record<string, unknown> = {
        alg: acmeJwsAlgorithm(this.options.accountKeyPem),
        nonce: await this.getNonce(directory.newNonce),
        url,
      };
      if (useAccount) {
        if (!this.accountUrl) throw new Error("ACME account is not registered");
        protectedHeader.kid = this.accountUrl;
      } else {
        protectedHeader.jwk = this.jwk;
      }
      const encodedProtected = encodeBase64Url(JSON.stringify(protectedHeader));
      const signingInput = `${encodedProtected}.${encodedPayload}`;
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/jose+json" },
        body: JSON.stringify({
          protected: encodedProtected,
          payload: encodedPayload,
          signature: signAcmeJws(this.options.accountKeyPem, signingInput),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const replayNonce = response.headers.get("replay-nonce") ?? undefined;
      this.nonce = replayNonce;
      if (!response.ok) {
        const body = await response.text();
        let problemType: string | undefined;
        try {
          const problem = JSON.parse(body) as Record<string, unknown>;
          problemType =
            typeof problem.type === "string" ? problem.type : undefined;
        } catch {
          // Preserve non-JSON ACME failures in the explicit error below.
        }
        if (
          problemType === "urn:ietf:params:acme:error:badNonce" &&
          attempt < MAX_BAD_NONCE_RETRIES
        ) {
          // Use the rejected response's nonce, or acquire one on retry.
          this.nonce = replayNonce;
          continue;
        }
        throw new Error(
          `ACME request failed (${response.status}): ${body.slice(0, 1000)}`,
        );
      }
      return response;
    }
    throw new Error("ACME badNonce retry limit exceeded");
  }

  private async getNonce(newNonceUrl: string): Promise<string> {
    if (this.nonce) {
      const nonce = this.nonce;
      this.nonce = undefined;
      return nonce;
    }
    const response = await this.fetchFn(newNonceUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const nonce = response.headers.get("replay-nonce");
    if (!response.ok || !nonce) {
      throw new Error(`Could not obtain ACME replay nonce (${response.status})`);
    }
    return nonce;
  }

  private async responseJson(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
  }

  private async completeAuthorization(
    authorizationUrl: string,
    onCreate: (challenge: Dns01Challenge) => Promise<void>,
    onRemove: (challenge: Dns01Challenge) => Promise<void>,
  ): Promise<void> {
    let authorization = parseAcmeAuthorization(await this.responseJson(
      await this.post(authorizationUrl, "", true),
    ));
    if (authorization.status === "valid") return;
    if (authorization.status !== "pending") {
      throw new Error(`ACME authorization is ${authorization.status}`);
    }
    const challenge = authorization.challenges.find((item) => item.type === "dns-01");
    if (!challenge) throw new Error("ACME authorization has no DNS-01 challenge");

    const keyAuthorization = `${challenge.token}.${acmeJwkThumbprint(this.options.accountKeyPem)}`;
    const host = authorization.identifier.value.toLowerCase().replace(/^\*\./, "");
    const recordName = `_acme-challenge.${host}`;
    const dnsChallenge = {
      host,
      recordName,
      recordValue: dns01RecordValue(keyAuthorization),
    };
    let operationError: unknown;
    let operationFailed = false;
    let cleanupError: unknown;
    let cleanupFailed = false;
    try {
      await onCreate(dnsChallenge);
      await waitForDns01Visibility(
        dnsChallenge,
        this.options.dnsResolverFactory ?? nativeDnsResolverFactory,
        this.waitFn,
        {
          ...DNS_PROPAGATION_DEFAULTS,
          ...this.options.dnsPropagationOptions,
        },
      );
      await this.post(challenge.url, {}, true);
      let authorized = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        authorization = parseAcmeAuthorization(await this.responseJson(
          await this.post(authorizationUrl, "", true),
        ));
        if (authorization.status === "valid") {
          authorized = true;
          break;
        }
        if (authorization.status === "invalid") {
          throw new Error("ACME DNS-01 authorization became invalid");
        }
        await this.waitFn(2000);
      }
      if (!authorized) {
        throw new Error("Timed out waiting for ACME DNS-01 authorization");
      }
    } catch (error) {
      operationError = error;
      operationFailed = true;
    } finally {
      try {
        await onRemove(dnsChallenge);
      } catch (error) {
        cleanupError = error;
        cleanupFailed = true;
      }
    }

    if (operationFailed) {
      if (cleanupFailed) {
        if (operationError instanceof Error) {
          try {
            Object.defineProperty(operationError, "cleanupError", {
              value: cleanupError,
              configurable: true,
              enumerable: false,
            });
          } catch {
            throw new AggregateError(
              [operationError, cleanupError],
              "ACME operation failed and DNS challenge cleanup also failed",
              { cause: operationError },
            );
          }
        } else {
          throw new AggregateError(
            [operationError, cleanupError],
            "ACME operation failed and DNS challenge cleanup also failed",
            { cause: operationError },
          );
        }
      }
      throw operationError;
    }
    if (cleanupFailed) throw cleanupError;
  }

  private async pollOrder(
    orderUrl: string,
    done: (order: AcmeOrder) => boolean,
  ): Promise<AcmeOrder> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const order = parseAcmeOrder(await this.responseJson(
        await this.post(orderUrl, "", true),
      ));
      if (done(order)) return order;
      if (order.status === "invalid") throw new Error("ACME order became invalid");
      await this.waitFn(2000);
    }
    throw new Error("Timed out waiting for ACME order");
  }
}

function validateIssuedCertificate(
  certificatePem: string,
  privateKeyPem: string,
  hostname: string,
): void {
  const certificateBlocks =
    certificatePem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    ) ?? [];
  const remainingPem = certificatePem
    .replace(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      "",
    )
    .trim();
  if (certificateBlocks.length === 0 || remainingPem) {
    throw new Error(
      "ACME response did not contain a valid PEM certificate chain",
    );
  }

  let leaf: NodeX509Certificate;
  try {
    const certificates = certificateBlocks.map(
      (certificate) => new NodeX509Certificate(certificate),
    );
    leaf = certificates[0];
  } catch (error) {
    throw new Error("ACME response contains an invalid X.509 certificate", {
      cause: error,
    });
  }

  const now = Date.now();
  const notBefore = Date.parse(leaf.validFrom);
  const notAfter = Date.parse(leaf.validTo);
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter)) {
    throw new Error("ACME certificate contains invalid validity dates");
  }
  if (notBefore > now) throw new Error("ACME certificate is not yet valid");
  if (notAfter <= now) throw new Error("ACME certificate is expired");

  const normalizedHost = hostname.toLowerCase();
  const wildcardRequested = normalizedHost.startsWith("*.");
  const hostnameToCheck = wildcardRequested
    ? `acme-validation.${normalizedHost.slice(2)}`
    : normalizedHost;
  const hasRequestedWildcardSan =
    !wildcardRequested ||
    leaf.subjectAltName
      ?.split(/,\s*/)
      .some((name) => name === `DNS:${normalizedHost}`);
  if (
    !leaf.checkHost(hostnameToCheck, { subject: "never" }) ||
    !hasRequestedWildcardSan
  ) {
    throw new Error(
      `ACME certificate does not contain a DNS SAN matching '${hostname}'`,
    );
  }

  const certificateKey = Buffer.from(
    leaf.publicKey.export({ type: "spki", format: "der" }),
  );
  const issuedKey = Buffer.from(
    createPublicKey(privateKeyPem).export({ type: "spki", format: "der" }),
  );
  if (
    certificateKey.length !== issuedKey.length ||
    !timingSafeEqual(certificateKey, issuedKey)
  ) {
    throw new Error("ACME certificate public key does not match its private key");
  }
}

async function waitForDns01Visibility(
  challenge: Dns01Challenge,
  createResolver: DnsResolverFactory,
  waitFn: (milliseconds: number) => Promise<void>,
  options: DnsPropagationOptions,
): Promise<void> {
  if (
    !Number.isInteger(options.attempts) ||
    options.attempts < 1 ||
    options.intervalMs < 0 ||
    options.resolverTimeoutMs < 1
  ) {
    throw new Error("DNS-01 propagation retry settings are invalid");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      if (
        await isVisibleOnEveryAuthority(
          challenge,
          createResolver,
          options.resolverTimeoutMs,
        )
      ) {
        return;
      }
      lastError = new Error("TXT value is not visible on every authoritative server yet");
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < options.attempts) {
      await waitFn(options.intervalMs);
    }
  }

  throw new Error(
    `DNS-01 TXT record '${challenge.recordName}' did not become visible on every authoritative nameserver after ${options.attempts} checks`,
    { cause: lastError },
  );
}

async function isVisibleOnEveryAuthority(
  challenge: Dns01Challenge,
  createResolver: DnsResolverFactory,
  resolverTimeoutMs: number,
): Promise<boolean> {
  // The system resolver is used only to discover the closest zone's NS set
  // and those servers' addresses. TXT readiness itself is checked against
  // each advertised authority directly, never through a recursive cache.
  const recursiveResolver = createResolver({
    timeout: resolverTimeoutMs,
    tries: 1,
  });
  const nameservers = await findAuthoritativeNameservers(
    challenge.host,
    recursiveResolver,
  );
  const authorityResults = await Promise.all(
    nameservers.map(async (nameserver) => {
      const addresses = await findNameserverAddresses(
        nameserver,
        recursiveResolver,
      );
      if (addresses.length === 0) {
        throw new Error(`Could not resolve an address for authoritative NS '${nameserver}'`);
      }
      const addressResults = await Promise.all(
        addresses.map(async (address) => {
          // Each server gets a fresh resolver so its answer cannot be served
          // by another authority's cache or an earlier query's connection.
          const authorityResolver = createResolver({
            timeout: resolverTimeoutMs,
            tries: 1,
          });
          authorityResolver.setServers([address]);
          const records = await authorityResolver.resolveTxt(
            challenge.recordName,
          );
          return records.some(
            (recordChunks) => recordChunks.join("") === challenge.recordValue,
          );
        }),
      );
      return addressResults.every(Boolean);
    }),
  );
  return authorityResults.length > 0 && authorityResults.every(Boolean);
}

async function findAuthoritativeNameservers(
  hostname: string,
  resolver: DnsResolver,
): Promise<string[]> {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  let lastError: unknown;
  // A DNS zone cannot be a single-label public TLD, so don't mistake the
  // registry's nameservers for the host's authoritative zone.
  for (let index = 0; index < labels.length - 1; index++) {
    const candidate = labels.slice(index).join(".");
    try {
      const nameservers = await resolver.resolveNs(candidate);
      if (nameservers.length > 0) {
        return [...new Set(nameservers.map((name) => name.replace(/\.$/, "")))];
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not find an authoritative DNS zone for '${hostname}'`, {
    cause: lastError,
  });
}

async function findNameserverAddresses(
  nameserver: string,
  resolver: DnsResolver,
): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.all([
    resolver.resolve4(nameserver).catch(() => []),
    resolver.resolve6(nameserver).catch(() => []),
  ]);
  return [...new Set([...ipv4, ...ipv6])];
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}