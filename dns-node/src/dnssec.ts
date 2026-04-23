/**
 * dns-node — DNSSEC Engine (file-based, no database).
 *
 * Implements RFC 4034 (ECDSAP256SHA256 signing), RFC 5155 (NSEC3).
 * Keys are stored as PEM files in DNSSEC_KEY_DIR (default: dns-node/keys/).
 *
 * Files:
 *   ksk.priv.pem, ksk.pub.pem  — Key-Signing Key
 *   zsk.priv.pem, zsk.pub.pem  — Zone-Signing Key
 *   key-meta.json               — { kskTag, zskTag, zone, createdAt, expiresAt }
 *
 * If keys don't exist, they are generated and saved on first call to initDnssec().
 */

import crypto from 'node:crypto';
import fs     from 'node:fs';
import path   from 'node:path';
import { DnsRecord, DnsKeyPair, TYPE, CLASS_IN } from './types.js';
import { canonicalWire, canonicalName } from './packet.js';

// ── Config ─────────────────────────────────────────────────────────────────

const KEY_DIR  = process.env.DNSSEC_KEY_DIR || path.join(process.cwd(), 'dns-node', 'keys');
const ALG      = 13;   // ECDSAP256SHA256
const KSK_FLAGS = 257; // Zone Key + SEP bit
const ZSK_FLAGS = 256; // Zone Key only
const SIG_VALIDITY_DAYS = 30;
export const NSEC3_ALGORITHM  = 1;   // SHA-1 — only defined NSEC3 hash algorithm
export const NSEC3_ITERATIONS = 0;   // RFC 9276: 0 for new deployments

// ── State ──────────────────────────────────────────────────────────────────

let ksk: DnsKeyPair | null = null;
let zsk: DnsKeyPair | null = null;
let zoneName = '';
let dnssecReady = false;

// ── Key tag (RFC 4034 §Appendix B) ───────────────────────────────────────

function computeKeyTag(rdata: Buffer): number {
  let ac = 0;
  for (let i = 0; i < rdata.length; i++) {
    ac += (i & 1) ? rdata[i] : rdata[i] << 8;
  }
  ac += (ac >> 16) & 0xFFFF;
  return ac & 0xFFFF;
}

// ── DNSKEY RDATA ──────────────────────────────────────────────────────────

function buildDnskeyRdata(flags: number, pubKeyRaw: Buffer): Buffer {
  // Flags(2) + Protocol(1=3) + Algorithm(1=13) + Public Key
  const hdr = Buffer.alloc(4);
  hdr.writeUInt16BE(flags, 0);
  hdr[2] = 3;   // protocol always 3
  hdr[3] = ALG;
  return Buffer.concat([hdr, pubKeyRaw]);
}

// ── P-256 key → raw 64-byte point ────────────────────────────────────────

function pubKeyToRaw(pubPem: string): Buffer {
  const key      = crypto.createPublicKey(pubPem);
  const exported = key.export({ type: 'spki', format: 'der' });
  // DER SPKI for P-256: 26 bytes header + 0x04 (uncompressed) + 64 bytes
  const raw = exported.slice(-65);  // 0x04 || x (32) || y (32)
  if (raw[0] !== 0x04) throw new Error('[DNSSEC] Unexpected P-256 public key format');
  return raw.slice(1);  // 64 bytes: x || y
}

// ── DER ECDSA signature → raw r||s (RFC 6605 §4) ─────────────────────────

function derToRaw(der: Buffer): Buffer {
  // SEQUENCE { INTEGER r, INTEGER s }
  let p = 2; // skip SEQUENCE tag + length
  if (der[1] === 0x81) p = 3; // long form length

  // r
  p++; // INTEGER tag
  const rLen = der[p++];
  let r = der.slice(p, p + rLen); p += rLen;
  // strip leading zero byte if present (DER positive integer encoding)
  if (r[0] === 0x00) r = r.slice(1);

  // s
  p++; // INTEGER tag
  const sLen = der[p++];
  let s = der.slice(p, p + sLen);
  if (s[0] === 0x00) s = s.slice(1);

  // pad each to 32 bytes
  const rPad = Buffer.alloc(32); r.copy(rPad, 32 - r.length);
  const sPad = Buffer.alloc(32); s.copy(sPad, 32 - s.length);
  return Buffer.concat([rPad, sPad]);
}

// ── Key generation + persistence ──────────────────────────────────────────

function generateKeyPair(flags: number): DnsKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privPem   = privateKey.export({ type: 'sec1', format: 'pem' }) as string;
  const pubPem    = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const pubRaw    = pubKeyToRaw(pubPem);
  const rdata     = buildDnskeyRdata(flags, pubRaw);
  const keyTag    = computeKeyTag(rdata);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  return { isKsk: flags === KSK_FLAGS, flags, algorithm: ALG, keyTag, privateKeyPem: privPem, publicKeyPem: pubPem, publicKeyRaw: pubRaw, expiresAt };
}

function saveKeys(zone: string): void {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  for (const [prefix, kp] of [['ksk', ksk!], ['zsk', zsk!]] as const) {
    fs.writeFileSync(path.join(KEY_DIR, `${prefix}.priv.pem`), kp.privateKeyPem);
    fs.writeFileSync(path.join(KEY_DIR, `${prefix}.pub.pem`),  kp.publicKeyPem);
  }
  fs.writeFileSync(path.join(KEY_DIR, 'key-meta.json'), JSON.stringify({
    zone,
    kskTag: ksk!.keyTag,
    zskTag: zsk!.keyTag,
    algorithm: ALG,
    createdAt:  new Date().toISOString(),
    expiresAt:  ksk!.expiresAt.toISOString(),
  }, null, 2));
}

function loadKeys(): boolean {
  const kskPriv = path.join(KEY_DIR, 'ksk.priv.pem');
  const kskPub  = path.join(KEY_DIR, 'ksk.pub.pem');
  const zskPriv = path.join(KEY_DIR, 'zsk.priv.pem');
  const zskPub  = path.join(KEY_DIR, 'zsk.pub.pem');

  if (!fs.existsSync(kskPriv)) return false;

  try {
    const makeKP = (priv: string, pub: string, flags: number): DnsKeyPair => {
      const privPem = fs.readFileSync(priv, 'utf8');
      const pubPem  = fs.readFileSync(pub,  'utf8');
      const pubRaw  = pubKeyToRaw(pubPem);
      const rdata   = buildDnskeyRdata(flags, pubRaw);
      const keyTag  = computeKeyTag(rdata);
      const meta    = JSON.parse(fs.readFileSync(path.join(KEY_DIR, 'key-meta.json'), 'utf8'));
      return { isKsk: flags === KSK_FLAGS, flags, algorithm: ALG, keyTag, privateKeyPem: privPem, publicKeyPem: pubPem, publicKeyRaw: pubRaw, expiresAt: new Date(meta.expiresAt) };
    };
    ksk = makeKP(kskPriv, kskPub, KSK_FLAGS);
    zsk = makeKP(zskPriv, zskPub, ZSK_FLAGS);
    return true;
  } catch {
    return false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

export function initDnssec(zone: string): void {
  zoneName = zone.toLowerCase();
  if (!zoneName.endsWith('.')) zoneName += '.';

  if (!loadKeys()) {
    console.log('[DNSSEC] Generating new KSK + ZSK key pairs...');
    ksk = generateKeyPair(KSK_FLAGS);
    zsk = generateKeyPair(ZSK_FLAGS);
    saveKeys(zone);
    console.log(`[DNSSEC] KSK tag=${ksk.keyTag}  ZSK tag=${zsk.keyTag}`);
  } else {
    console.log(`[DNSSEC] Keys loaded — KSK tag=${ksk!.keyTag}  ZSK tag=${zsk!.keyTag}`);
  }
  dnssecReady = true;
}

export function isDnssecReady(): boolean { return dnssecReady; }
export function getKsk(): DnsKeyPair | null { return ksk; }
export function getZsk(): DnsKeyPair | null { return zsk; }

// ── DNSKEY records ────────────────────────────────────────────────────────

export function getDnskeyRecords(zone: string): DnsRecord[] {
  if (!ksk || !zsk) return [];
  const make = (kp: DnsKeyPair): DnsRecord => ({
    name:  zone.replace(/\.$/, ''),
    type:  TYPE.DNSKEY,
    class: CLASS_IN,
    ttl:   3600,
    rdata: buildDnskeyRdata(kp.flags, kp.publicKeyRaw),
  });
  return [make(ksk), make(zsk)];
}

// ── RRSIG record ──────────────────────────────────────────────────────────

/**
 * Sign an RRset with the ZSK (or KSK for DNSKEY RRsets).
 * Returns an RRSIG DnsRecord.
 */
export function signRRset(rrset: DnsRecord[], typeCovered: number): DnsRecord | null {
  if (!ksk || !zsk || rrset.length === 0) return null;

  const signerKey = typeCovered === TYPE.DNSKEY ? ksk : zsk;
  const ownName   = rrset[0].name;
  const labels    = ownName.split('.').filter(Boolean).length;
  const ttl       = rrset[0].ttl;
  const now       = Math.floor(Date.now() / 1000);
  const inception  = now - 300;                       // 5 min clock skew
  const expiration = now + SIG_VALIDITY_DAYS * 86400;

  // RRSIG_RDATA without signature (RFC 4034 §3.1)
  const zoneNameWire = canonicalName(zoneName);
  const signerNameBuf = zoneNameWire;

  const rrsigHeader = Buffer.alloc(18 + signerNameBuf.length);
  rrsigHeader.writeUInt16BE(typeCovered,        0);
  rrsigHeader[2] = ALG;
  rrsigHeader[3] = labels;
  rrsigHeader.writeUInt32BE(ttl,                4);
  rrsigHeader.writeUInt32BE(expiration,          8);
  rrsigHeader.writeUInt32BE(inception,          12);
  rrsigHeader.writeUInt16BE(signerKey.keyTag,   16);
  signerNameBuf.copy(rrsigHeader, 18);

  // Sort RRset canonical order (RFC 4034 §6.3): same type/class/owner → sort by RDATA
  const sorted = [...rrset].sort((a, b) => a.rdata.compare(b.rdata));

  // Canonical wire-format RRs (with RRsig header prepended for signing)
  const parts = [rrsigHeader, ...sorted.map(canonicalWire)];
  const toSign = Buffer.concat(parts);

  // Sign with ECDSA-P256-SHA256
  let sigDer: Buffer;
  try {
    const privKey = crypto.createPrivateKey(signerKey.privateKeyPem);
    sigDer = crypto.sign('SHA256', toSign, { key: privKey, dsaEncoding: 'der' });
  } catch {
    return null;
  }
  const sigRaw = derToRaw(sigDer);

  // Build RRSIG RDATA (RFC 4034 §3.1)
  const rdata = Buffer.concat([rrsigHeader, sigRaw]);

  return {
    name:  ownName,
    type:  TYPE.RRSIG,
    class: CLASS_IN,
    ttl,
    rdata,
  };
}

// ── DS record ─────────────────────────────────────────────────────────────

/**
 * Build the DS record for uploading to the parent zone.
 * DS = SHA-256 hash of (owner-wire || DNSKEY-RDATA), per RFC 4034 §5.1.
 */
export function getDSRecord(zone: string): DnsRecord | null {
  if (!ksk) return null;

  const ownerWire = canonicalName(zone.endsWith('.') ? zone : `${zone}.`);
  const rdata     = buildDnskeyRdata(ksk.flags, ksk.publicKeyRaw);
  const digest    = crypto.createHash('sha256').update(Buffer.concat([ownerWire, rdata])).digest();

  const dsRdata = Buffer.alloc(4 + digest.length);
  dsRdata.writeUInt16BE(ksk.keyTag, 0);
  dsRdata[2] = ALG;
  dsRdata[3] = 2; // SHA-256 digest type
  digest.copy(dsRdata, 4);

  return {
    name:  zone.replace(/\.$/, ''),
    type:  TYPE.DS,
    class: CLASS_IN,
    ttl:   3600,
    rdata: dsRdata,
  };
}

// ── NSEC3 chain ───────────────────────────────────────────────────────────

const BASE32HEX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32encode(buf: Buffer): string {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out  += BASE32HEX[(val >>> (bits - 5)) & 0x1F];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32HEX[(val << (5 - bits)) & 0x1F];
  return out.toLowerCase();
}

export function nsec3Hash(name: string, salt: Buffer, iterations: number): Buffer {
  const nameLower = name.toLowerCase();
  const wire = canonicalName(nameLower.endsWith('.') ? nameLower : `${nameLower}.`);
  let hash = Buffer.concat([wire, salt]);
  for (let i = 0; i <= iterations; i++) {
    hash = crypto.createHash('sha1').update(hash).digest();
    if (i < iterations) hash = Buffer.concat([hash, salt]);
  }
  return hash;
}

export function nsec3HashedOwner(name: string, zone: string, salt: Buffer): string {
  const h = nsec3Hash(name, salt, NSEC3_ITERATIONS);
  return `${base32encode(h)}.${zone.replace(/\.$/, '')}`;
}

/** NSEC3PARAM RDATA: algorithm(1) + flags(1) + iterations(2) + salt-len(1) + salt */
export function buildNsec3ParamRdata(salt: Buffer): Buffer {
  const b = Buffer.alloc(5 + salt.length);
  b[0] = NSEC3_ALGORITHM;
  b[1] = 0;    // opt-out not set
  b.writeUInt16BE(NSEC3_ITERATIONS, 2);
  b[4] = salt.length;
  salt.copy(b, 5);
  return b;
}

/** Build a type bitmap covering the given type codes. */
export function buildTypeBitmap(types: number[]): Buffer {
  const windows = new Map<number, number[]>();
  for (const t of types) {
    const win  = t >> 8;
    const bit  = t & 0xFF;
    if (!windows.has(win)) windows.set(win, []);
    windows.get(win)!.push(bit);
  }

  const parts: Buffer[] = [];
  for (const [win, bits] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
    const maxBit  = Math.max(...bits);
    const len     = Math.ceil((maxBit + 1) / 8);
    const bm      = Buffer.alloc(len);
    for (const b of bits) bm[b >> 3] |= 1 << (7 - (b & 7));
    parts.push(Buffer.from([win, len]), bm);
  }
  return Buffer.concat(parts);
}

/** NSEC3 RDATA for a single hash bucket. */
export function buildNsec3Rdata(
  salt: Buffer,
  nextHash: Buffer,
  types: number[],
): Buffer {
  const bitmap   = buildTypeBitmap(types);
  const b        = Buffer.alloc(5 + salt.length + 1 + nextHash.length + bitmap.length);
  let p          = 0;
  b[p++]         = NSEC3_ALGORITHM;
  b[p++]         = 0;          // flags
  b.writeUInt16BE(NSEC3_ITERATIONS, p); p += 2;
  b[p++]         = salt.length;
  salt.copy(b, p); p += salt.length;
  b[p++]         = nextHash.length;
  nextHash.copy(b, p); p += nextHash.length;
  bitmap.copy(b, p);
  return b;
}

// ── Zone salt (deterministic per zone) ──────────────────────────────────

export function getZoneSalt(zone: string): Buffer {
  return crypto.createHash('sha256').update(`nsec3-salt:${zone}`).digest().slice(0, 8);
}
