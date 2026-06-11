/**
 * Max Booster — DNSSEC Implementation
 *
 * Full DNSSEC signing engine for the Max Booster authoritative DNS server.
 * Implements RFC 4033 (Security Introduction), RFC 4034 (Resource Records),
 * RFC 4035 (Protocol Modifications), RFC 6605 (ECDSA), RFC 5155 (NSEC3).
 *
 * Algorithm: ECDSAP256SHA256 (algorithm 13) — recommended by RFC 8624.
 *   - Equivalent security to RSA-3072 with much smaller keys (64 bytes vs 512)
 *   - Native to Node.js crypto (P-256 curve)
 *
 * Key hierarchy:
 *   KSK (flags=257) — signs only the DNSKEY RRset; its hash is the DS record
 *                     uploaded to the parent zone (registrar).
 *   ZSK (flags=256) — signs all other RRsets in the zone; rotated more often.
 *
 * How signing works:
 *   1. Convert each RR in the RRset to canonical wire format (RFC 4034 §6.2):
 *      - All owner names lowercased
 *      - No pointer compression (fully expanded)
 *   2. Sort the RRset in canonical order (RFC 4034 §6.3):
 *      - Same owner + type → sort by RDATA bytes lexicographically
 *   3. Build RRSIG_RDATA prefix (everything except the Signature field)
 *   4. Sign: SHA-256(RRSIG_prefix || canonical_RR_1 || ... || canonical_RR_n)
 *      using the ZSK private key (ECDSA P-256)
 *   5. Convert DER signature → raw r||s (64 bytes) per RFC 6605 §4
 *
 * NSEC3 (RFC 5155) provides authenticated denial of existence without
 * zone enumeration. Each owner name is hashed SHA-1(x iterations + salt).
 */

import crypto from "crypto";
import { db } from "../db.js";
import { dnssecKeys } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DNSSEC_ALGORITHM = 13; // ECDSAP256SHA256
export const DNSSEC_DIGEST_TYPE = 2; // SHA-256 for DS records
export const NSEC3_ALGORITHM = 1; // SHA-1 (only defined NSEC3 hash alg)
export const NSEC3_FLAGS = 0; // opt-out not set
export const NSEC3_ITERATIONS = 0; // 0 per RFC 9276 (security guidance 2022)
export const SIGNATURE_VALIDITY_DAYS = 30;
export const KSK_FLAGS = 257; // Zone Key (256) + SEP bit (1)
export const ZSK_FLAGS = 256; // Zone Key only

// RFC 4034 §A.1 — numeric type codes
export const RRTYPE_A = 1;
export const RRTYPE_NS = 2;
export const RRTYPE_SOA = 6;
export const RRTYPE_MX = 15;
export const RRTYPE_TXT = 16;
export const RRTYPE_AAAA = 28;
export const RRTYPE_RRSIG = 46;
export const RRTYPE_NSEC = 47;
export const RRTYPE_DNSKEY = 48;
export const RRTYPE_DS = 43;
export const RRTYPE_NSEC3 = 50;
export const RRTYPE_NSEC3PAR = 51;
export const RRTYPE_CAA = 257;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DnssecKeyPair {
  zone: string;
  isKsk: boolean;
  algorithm: number;
  flags: number;
  keyTag: number;
  privateKeyPem: string;
  publicKeyPem: string;
  /** Raw 64-byte uncompressed P-256 public key (x || y, no 0x04 prefix) */
  publicKeyRaw: Buffer;
  expiresAt: Date;
}

export interface DnskeyRecord {
  flags: number;
  protocol: number;
  algorithm: number;
  key: Buffer; // raw public key bytes
  keyTag: number;
}

export interface RrsigRecord {
  typeCovered: string;
  algorithm: number;
  labels: number;
  originalTTL: number;
  expiration: number; // unix timestamp
  inception: number; // unix timestamp
  keyTag: number;
  signersName: string;
  signature: Buffer; // raw r||s (64 bytes for P-256)
}

export interface DsRecord {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: Buffer;
}

export interface Nsec3Record {
  algorithm: number;
  flags: number;
  iterations: number;
  salt: Buffer;
  nextDomain: Buffer; // hashed next owner name
  typeBitmap: Buffer; // bitmap of record types at this name
}

// ── Key tag computation (RFC 4034 §B) ─────────────────────────────────────────

/**
 * Compute the key tag for a DNSKEY record.
 * The key tag is a 16-bit checksum of the DNSKEY RDATA.
 * Used to link RRSIG records back to the signing key.
 */
export function computeKeyTag(
  flags: number,
  protocol: number,
  algorithm: number,
  publicKeyRaw: Buffer,
): number {
  // Build DNSKEY RDATA: flags(2) + protocol(1) + algorithm(1) + key(64)
  const rdata = Buffer.alloc(4 + publicKeyRaw.length);
  rdata.writeUInt16BE(flags, 0);
  rdata.writeUInt8(protocol, 2);
  rdata.writeUInt8(algorithm, 3);
  publicKeyRaw.copy(rdata, 4);

  let ac = 0;
  for (let i = 0; i < rdata.length; i++) {
    ac += i & 1 ? rdata[i] : rdata[i] << 8;
  }
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
}

// ── Key generation ────────────────────────────────────────────────────────────

/**
 * Generate a new ECDSA P-256 key pair for DNSSEC.
 * Returns both PEM-encoded keys (for DB storage) and the raw 64-byte
 * public key (for DNSKEY RDATA per RFC 6605).
 */
export function generateKeyPair(
  isKsk: boolean,
  zone: string,
): {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyRaw: Buffer;
  flags: number;
  keyTag: number;
} {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });

  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  }) as string;
  const publicKeyPem = publicKey.export({
    format: "pem",
    type: "spki",
  }) as string;

  // Extract raw 64-byte uncompressed public key (x || y) from SPKI DER
  // SPKI structure for P-256: 30 59 30 13 ... 03 42 00 04 [x:32][y:32]
  // The last 64 bytes of the DER export are x || y (after 0x04 prefix)
  const spkiDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRaw = spkiDer.slice(spkiDer.length - 64);

  const flags = isKsk ? KSK_FLAGS : ZSK_FLAGS;
  const keyTag = computeKeyTag(flags, 3, DNSSEC_ALGORITHM, publicKeyRaw);

  logger.info({ zone, isKsk, keyTag }, "[DNSSEC] Generated key pair");
  return { privateKeyPem, publicKeyPem, publicKeyRaw, flags, keyTag };
}

// ── DS record computation ─────────────────────────────────────────────────────

/**
 * Compute the DS (Delegation Signer) record for a KSK.
 * DS = SHA-256(owner_wire_name || DNSKEY_RDATA)
 * This is uploaded to the parent zone (your domain registrar).
 *
 * RFC 4034 §5.1.4
 */
export function computeDS(
  zone: string,
  flags: number,
  protocol: number,
  algorithm: number,
  publicKeyRaw: Buffer,
  keyTag: number,
): DsRecord {
  // Encode zone name in wire format (canonical, lowercase)
  const ownerWire = encodeNameWire(zone.toLowerCase());

  // DNSKEY RDATA
  const dnskeyRdata = Buffer.alloc(4 + publicKeyRaw.length);
  dnskeyRdata.writeUInt16BE(flags, 0);
  dnskeyRdata.writeUInt8(protocol, 2);
  dnskeyRdata.writeUInt8(algorithm, 3);
  publicKeyRaw.copy(dnskeyRdata, 4);

  // DS digest = SHA-256(owner_wire || dnskey_rdata)
  const digest = crypto
    .createHash("sha256")
    .update(ownerWire)
    .update(dnskeyRdata)
    .digest();

  return { keyTag, algorithm, digestType: DNSSEC_DIGEST_TYPE, digest };
}

// ── Wire format utilities ─────────────────────────────────────────────────────

/**
 * Encode a DNS name in wire format (RFC 1035 §3.1).
 * Each label is prefixed with its length. Terminated with 0x00.
 * Names are lowercased per RFC 4034 §6.2.
 */
export function encodeNameWire(name: string): Buffer {
  const n = name.toLowerCase().replace(/\.$/, "");
  if (n === "") return Buffer.from([0]);

  const parts = n.split(".");
  const bufs: Buffer[] = [];
  for (const part of parts) {
    const b = Buffer.from(part, "ascii");
    const len = Buffer.alloc(1);
    len[0] = b.length;
    bufs.push(len, b);
  }
  bufs.push(Buffer.from([0]));
  return Buffer.concat(bufs);
}

/**
 * Count the number of labels in a DNS name (RFC 4034 §3.1.3).
 * Wildcards: a leading '*' label is NOT counted.
 */
export function countLabels(name: string): number {
  const n = name.toLowerCase().replace(/\.$/, "");
  const parts = n.split(".").filter(Boolean);
  return parts[0] === "*" ? parts.length - 1 : parts.length;
}

// ── RRSIG signing ─────────────────────────────────────────────────────────────

/**
 * Convert a DER-encoded ECDSA signature to raw r||s format (RFC 6605 §4).
 * Node.js crypto returns DER; DNSSEC needs raw 64 bytes for P-256.
 *
 * DER: 30 xx 02 rLen r... 02 sLen s...
 * Raw: r(32 bytes, big-endian, zero-padded) || s(32 bytes, big-endian, zero-padded)
 */
export function derToRaw(derSig: Buffer, keySize = 32): Buffer {
  let offset = 2; // skip 0x30 (SEQUENCE) + length
  if (derSig[offset] === 0x02) {
    offset++;
    const rLen = derSig[offset++];
    const r = derSig.slice(offset, offset + rLen);
    offset += rLen;
    if (derSig[offset] === 0x02) {
      offset++;
      const sLen = derSig[offset++];
      const s = derSig.slice(offset, offset + sLen);

      const raw = Buffer.alloc(keySize * 2);
      // Remove any leading 0x00 padding (DER adds it for positive integers)
      const rClean = r[0] === 0x00 ? r.slice(1) : r;
      const sClean = s[0] === 0x00 ? s.slice(1) : s;
      rClean.copy(raw, keySize - rClean.length);
      sClean.copy(raw, keySize * 2 - sClean.length);
      return raw;
    }
  }
  // Fallback: return DER padded to expected length (shouldn't happen)
  return derSig.slice(0, keySize * 2);
}

/**
 * Build the canonical wire-format RDATA for an A record.
 */

/**
 * Build the canonical wire-format RDATA for an AAAA record.
 */

/**
 * Build a canonical wire-format DNS RR for signing (RFC 4034 §6.2).
 * Format: owner(wire) + type(2) + class(2) + TTL(4) + rdlength(2) + RDATA
 */
function canonicalRR(
  ownerWire: Buffer,
  type: number,
  classIN: number,
  ttl: number,
  rdata: Buffer,
): Buffer {
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(classIN, 2);
  header.writeUInt32BE(ttl, 4);
  header.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([ownerWire, header, rdata]);
}

/**
 * Sign an RRset and return the RRSIG record data.
 *
 * @param typeCovered - string type name e.g. 'A', 'NS', 'DNSKEY'
 * @param typeNum     - numeric type code
 * @param ownerName   - FQDN of the RRset owner
 * @param ttl         - original TTL of the RRset
 * @param rdatas      - array of RDATA buffers (one per RR in the RRset)
 * @param privateKeyPem - PEM-encoded private key
 * @param keyTag      - key tag of the signing key
 * @param zone        - zone name (signer's name)
 * @returns RrsigRecord ready for dns-packet encoding
 */
export function signRRset(
  typeCovered: string,
  typeNum: number,
  ownerName: string,
  ttl: number,
  rdatas: Buffer[],
  privateKeyPem: string,
  keyTag: number,
  zone: string,
): RrsigRecord {
  const now = Math.floor(Date.now() / 1000);
  const inception = now - 300; // 5 min backdated for clock skew
  const expiration = now + SIGNATURE_VALIDITY_DAYS * 86400;
  const labels = countLabels(ownerName);
  const ownerWire = encodeNameWire(ownerName.toLowerCase());

  // Build RRSIG_RDATA prefix (all fields except Signature) per RFC 4034 §3.1
  const signerWire = encodeNameWire(zone.toLowerCase());
  const rrsigPrefix = Buffer.alloc(18 + signerWire.length);
  let offset = 0;
  rrsigPrefix.writeUInt16BE(typeNum, offset);
  offset += 2;
  rrsigPrefix.writeUInt8(DNSSEC_ALGORITHM, offset);
  offset += 1;
  rrsigPrefix.writeUInt8(labels, offset);
  offset += 1;
  rrsigPrefix.writeUInt32BE(ttl, offset);
  offset += 4;
  rrsigPrefix.writeUInt32BE(expiration, offset);
  offset += 4;
  rrsigPrefix.writeUInt32BE(inception, offset);
  offset += 4;
  rrsigPrefix.writeUInt16BE(keyTag, offset);
  offset += 2;
  signerWire.copy(rrsigPrefix, offset);

  // Build canonical RRs sorted by RDATA (RFC 4034 §6.3)
  // All RRs in an RRset have the same owner, type, class, and TTL — sort by RDATA only
  const sortedRdatas = [...rdatas].sort((a, b) => a.compare(b));
  const canonicalRRs = sortedRdatas.map((rdata) =>
    canonicalRR(ownerWire, typeNum, 1 /* IN */, ttl, rdata),
  );

  // Payload to sign: RRSIG_RDATA_prefix || canonical_RR_1 || ... || canonical_RR_n
  const payload = Buffer.concat([rrsigPrefix, ...canonicalRRs]);

  // Sign with ECDSA P-256 using SHA-256
  const key = crypto.createPrivateKey(privateKeyPem);
  const derSig = Buffer.from(crypto.sign("SHA256", payload, key));

  // Convert DER → raw r||s (64 bytes for P-256)
  const rawSig = derToRaw(derSig, 32);

  return {
    typeCovered,
    algorithm: DNSSEC_ALGORITHM,
    labels,
    originalTTL: ttl,
    expiration,
    inception,
    keyTag,
    signersName: zone,
    signature: rawSig,
  };
}

// ── NSEC3 ─────────────────────────────────────────────────────────────────────

/**
 * Compute the NSEC3 hash of a DNS name (RFC 5155 §5).
 * hash = SHA-1(iterations of: SHA-1(name_wire || salt))
 * Starting value: SHA-1(name_wire || salt)
 * Then iterated `iterations` more times: SHA-1(prev_hash || salt)
 */
export function nsec3Hash(
  name: string,
  salt: Buffer,
  iterations: number,
): Buffer {
  const nameWire = encodeNameWire(name.toLowerCase());

  // IH(salt, x, 0) = SHA-1(x || salt)
  let hash = crypto.createHash("sha1").update(nameWire).update(salt).digest();

  // IH(salt, x, k) = SHA-1(IH(salt, x, k-1) || salt)
  for (let i = 0; i < iterations; i++) {
    hash = crypto.createHash("sha1").update(hash).update(salt).digest();
  }

  return hash;
}

/**
 * Encode a byte buffer as base32hex (RFC 4648 §7, extended hex alphabet).
 * NSEC3 uses base32hex (not base32) to preserve sort order.
 */
export function base32hex(buf: Buffer): string {
  const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += ALPHABET[(value << (5 - bits)) & 31];
  }
  return result;
}

/**
 * Build a type bitmap for NSEC3/NSEC records (RFC 4034 §4.1.2).
 * Input: array of numeric RR type codes present at this name.
 */
export function buildTypeBitmap(types: number[]): Buffer {
  const windows: Map<number, number[]> = new Map();

  for (const t of types) {
    const windowNum = t >> 8; // high byte = window number
    const bitPos = t & 0xff; // low byte = bit position in window
    if (!windows.has(windowNum)) windows.set(windowNum, []);
    windows.get(windowNum)!.push(bitPos);
  }

  const parts: Buffer[] = [];
  for (const [windowNum, bits] of [...windows].sort((a, b) => a[0] - b[0])) {
    const maxBit = Math.max(...bits);
    const bitmapLen = Math.ceil((maxBit + 1) / 8);
    const bitmap = Buffer.alloc(bitmapLen);
    for (const bit of bits) {
      bitmap[bit >> 3] |= 0x80 >> (bit & 7);
    }
    const win = Buffer.alloc(2 + bitmapLen);
    win[0] = windowNum;
    win[1] = bitmapLen;
    bitmap.copy(win, 2);
    parts.push(win);
  }

  return Buffer.concat(parts);
}

/**
 * Build an NSEC3 record for a given owner name.
 *
 * @param name       - Owner name being hashed
 * @param nextName   - Next owner name (for chaining)
 * @param types      - RR types present at this name
 * @param salt       - NSEC3 salt (use fixed salt or random per zone)
 * @param iterations - Hash iterations (0 per RFC 9276)
 * @returns { nsec3HashedName, nsec3Record } for dns-packet
 */
export function buildNSEC3(
  name: string,
  nextName: string,
  types: number[],
  salt: Buffer,
  iterations: number = NSEC3_ITERATIONS,
): { hashedName: string; nextDomain: Buffer; typeBitmap: Buffer } {
  const hashedName = base32hex(nsec3Hash(name, salt, iterations));
  const nextDomain = nsec3Hash(nextName, salt, iterations);
  const typeBitmap = buildTypeBitmap(types);

  return { hashedName, nextDomain, typeBitmap };
}

// ── NSEC3PARAM raw wire encoding ──────────────────────────────────────────────

/**
 * Build raw RDATA buffer for an NSEC3PARAM record.
 * Wire format: algorithm(1) + flags(1) + iterations(2) + salt_length(1) + salt
 */
export function nsec3ParamRdata(
  salt: Buffer,
  iterations = NSEC3_ITERATIONS,
): Buffer {
  const buf = Buffer.alloc(5 + salt.length);
  buf[0] = NSEC3_ALGORITHM; // SHA-1
  buf[1] = NSEC3_FLAGS;
  buf.writeUInt16BE(iterations, 2);
  buf[4] = salt.length;
  salt.copy(buf, 5);
  return buf;
}

/**
 * Build raw RDATA buffer for an NSEC3 record.
 * Wire format: algorithm(1) + flags(1) + iterations(2) + salt_length(1) + salt
 *              + hash_length(1) + next_hashed_owner_name + type_bit_maps
 */
export function nsec3Rdata(
  nextDomain: Buffer,
  typeBitmap: Buffer,
  salt: Buffer,
  iterations = NSEC3_ITERATIONS,
): Buffer {
  const buf = Buffer.alloc(
    5 + salt.length + 1 + nextDomain.length + typeBitmap.length,
  );
  let off = 0;
  buf[off++] = NSEC3_ALGORITHM;
  buf[off++] = NSEC3_FLAGS;
  buf.writeUInt16BE(iterations, off);
  off += 2;
  buf[off++] = salt.length;
  salt.copy(buf, off);
  off += salt.length;
  buf[off++] = nextDomain.length;
  nextDomain.copy(buf, off);
  off += nextDomain.length;
  typeBitmap.copy(buf, off);
  return buf;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/** Load active key pair(s) for a zone from DB. Returns [ksk, zsk] or null. */
export async function loadKeys(
  zone: string,
): Promise<{ ksk: DnssecKeyPair; zsk: DnssecKeyPair } | null> {
  try {
    const rows = await db
      .select()
      .from(dnssecKeys)
      .where(eq(dnssecKeys.zone, zone));

    if (rows.length < 2) return null;

    const kskRow = rows.find((r) => r.isKsk);
    const zskRow = rows.find((r) => !r.isKsk);
    if (!kskRow || !zskRow) return null;

    const toKeyPair = (r: (typeof rows)[0]): DnssecKeyPair => ({
      zone: r.zone,
      isKsk: r.isKsk ?? false,
      algorithm: r.algorithm,
      flags: r.flags,
      keyTag: r.keyTag,
      privateKeyPem: r.privateKeyPem,
      publicKeyPem: r.publicKeyPem,
      publicKeyRaw: Buffer.from(r.publicKeyRaw as string, "base64"),
      expiresAt: r.expiresAt ?? new Date(Date.now() + 90 * 86400000),
    });

    return { ksk: toKeyPair(kskRow), zsk: toKeyPair(zskRow) };
  } catch (err) {
    logger.warn({ err, zone }, "[DNSSEC] Failed to load keys from DB");
    return null;
  }
}

/** Generate and store a fresh KSK + ZSK pair for the zone. */
export async function provisionKeys(
  zone: string,
): Promise<{ ksk: DnssecKeyPair; zsk: DnssecKeyPair }> {
  const kskGen = generateKeyPair(true, zone);
  const zskGen = generateKeyPair(false, zone);

  const expiresAt = new Date(Date.now() + 365 * 86400000); // 1 year

  const toInsert = (
    gen: ReturnType<typeof generateKeyPair>,
    isKsk: boolean,
  ) => ({
    zone,
    isKsk,
    algorithm: DNSSEC_ALGORITHM,
    flags: gen.flags,
    keyTag: gen.keyTag,
    privateKeyPem: gen.privateKeyPem,
    publicKeyPem: gen.publicKeyPem,
    publicKeyRaw: gen.publicKeyRaw.toString("base64"),
    expiresAt,
  });

  await db
    .insert(dnssecKeys)
    .values([toInsert(kskGen, true), toInsert(zskGen, false)]);

  logger.info(
    { zone, kskTag: kskGen.keyTag, zskTag: zskGen.keyTag },
    "[DNSSEC] Keys provisioned",
  );

  const makeKP = (
    gen: ReturnType<typeof generateKeyPair>,
    isKsk: boolean,
  ): DnssecKeyPair => ({
    zone,
    isKsk,
    algorithm: DNSSEC_ALGORITHM,
    flags: gen.flags,
    keyTag: gen.keyTag,
    privateKeyPem: gen.privateKeyPem,
    publicKeyPem: gen.publicKeyPem,
    publicKeyRaw: gen.publicKeyRaw,
    expiresAt,
  });

  return { ksk: makeKP(kskGen, true), zsk: makeKP(zskGen, false) };
}

/** Get (or create) keys for a zone. Cached in-memory for 5 min. */
const keyCache = new Map<
  string,
  { keys: { ksk: DnssecKeyPair; zsk: DnssecKeyPair }; cachedAt: number }
>();

export async function getOrCreateKeys(
  zone: string,
): Promise<{ ksk: DnssecKeyPair; zsk: DnssecKeyPair } | null> {
  const cached = keyCache.get(zone);
  if (cached && Date.now() - cached.cachedAt < 300_000) return cached.keys;

  let keys = await loadKeys(zone);
  if (!keys) keys = await provisionKeys(zone);

  keyCache.set(zone, { keys, cachedAt: Date.now() });
  return keys;
}

// ── DNSKEY record builder ──────────────────────────────────────────────────────

/** Build dns-packet-compatible DNSKEY record data. */
export function makeDnskeyData(kp: DnssecKeyPair): DnskeyRecord {
  return {
    flags: kp.flags,
    protocol: 3,
    algorithm: kp.algorithm,
    key: kp.publicKeyRaw,
    keyTag: kp.keyTag,
  };
}

/** Build DS record data ready for dns-packet or display. */
export function makeDS(kp: DnssecKeyPair): DsRecord {
  return computeDS(
    kp.zone,
    kp.flags,
    3,
    kp.algorithm,
    kp.publicKeyRaw,
    kp.keyTag,
  );
}

// ── Zone NSEC3 salt (fixed per zone, stored with keys) ───────────────────────

/** Derive a deterministic NSEC3 salt from the zone name. 8 bytes as per common practice. */
export function zoneSalt(zone: string): Buffer {
  return crypto
    .createHash("sha256")
    .update("nsec3-salt:" + zone)
    .digest()
    .slice(0, 8);
}
