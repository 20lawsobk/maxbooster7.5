/**
 * dns-node — Binary DNS packet codec.
 *
 * Implements RFC 1035 wire format from scratch using Node's Buffer API.
 * No external DNS library dependency.
 *
 * Parser: Buffer → DnsPacket
 * Builder: RRset → Buffer (response encoding)
 *
 * Name compression:
 *   - Parser: follows compression pointers (0xC0 prefix)
 *   - Builder: writes full uncompressed labels (safe for authoritative servers)
 */

import {
  CLASS_IN,
  RCODE_FORMERR,
  TYPE,
  DnsHeader,
  DnsQuestion,
  DnsRecord,
  DnsPacket,
} from "./types.js";

// ── Reader helper ──────────────────────────────────────────────────────────

class Reader {
  pos = 0;
  constructor(public buf: Buffer) {}

  u8(): number {
    return this.buf.readUInt8(this.pos++);
  }
  u16(): number {
    const v = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  slice(len: number): Buffer {
    const s = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return s;
  }

  /** Read a DNS name following RFC 1035 §3.1 compression. */
  name(): string {
    const labels: string[] = [];
    const visited = new Set<number>();

    let p = this.pos;
    let jumped = false;

    while (true) {
      if (p >= this.buf.length) break;
      const len = this.buf.readUInt8(p);

      if (len === 0) {
        if (!jumped) this.pos = p + 1;
        break;
      }

      // Compression pointer: top 2 bits = 11
      if ((len & 0xc0) === 0xc0) {
        const offset = ((len & 0x3f) << 8) | this.buf.readUInt8(p + 1);
        if (!jumped) this.pos = p + 2;
        if (visited.has(offset)) break; // loop guard
        visited.add(offset);
        jumped = true;
        p = offset;
        continue;
      }

      p++;
      labels.push(this.buf.slice(p, p + len).toString("ascii"));
      p += len;
    }

    return labels.length ? labels.join(".") : ".";
  }
}

// ── Writer helper ──────────────────────────────────────────────────────────

class Writer {
  parts: Buffer[] = [];

  u8(v: number) {
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.parts.push(b);
  }
  u16(v: number) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(v, 0);
    this.parts.push(b);
  }
  u32(v: number) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(v, 0);
    this.parts.push(b);
  }
  raw(b: Buffer) {
    this.parts.push(b);
  }

  /** Write a DNS name as uncompressed labels. */
  name(n: string) {
    const fqdn = n.endsWith(".") ? n.slice(0, -1) : n;
    if (!fqdn || fqdn === ".") {
      this.u8(0);
      return;
    }
    for (const label of fqdn.toLowerCase().split(".")) {
      const lb = Buffer.from(label, "ascii");
      this.u8(lb.length);
      this.raw(lb);
    }
    this.u8(0);
  }

  build(): Buffer {
    return Buffer.concat(this.parts);
  }
  byteLength(): number {
    return this.parts.reduce((s, b) => s + b.length, 0);
  }
}

// ── Parse ──────────────────────────────────────────────────────────────────

export function parsePacket(buf: Buffer): DnsPacket {
  const r = new Reader(buf);

  const id = r.u16();
  const flags = r.u16();
  const qdcnt = r.u16();
  const ancnt = r.u16();
  const nscnt = r.u16();
  const arcnt = r.u16();

  const header: DnsHeader = {
    id,
    qr: (flags >> 15) & 1,
    opcode: (flags >> 11) & 0xf,
    aa: (flags >> 10) & 1,
    tc: (flags >> 9) & 1,
    rd: (flags >> 8) & 1,
    ra: (flags >> 7) & 1,
    z: (flags >> 6) & 1,
    ad: (flags >> 5) & 1,
    cd: (flags >> 4) & 1,
    rcode: flags & 0xf,
  };

  const questions: DnsQuestion[] = [];
  for (let i = 0; i < qdcnt; i++) {
    const name = r.name();
    const type = r.u16();
    const cls = r.u16();
    questions.push({ name, type, class: cls });
  }

  function readRRs(count: number): DnsRecord[] {
    const rrs: DnsRecord[] = [];
    for (let i = 0; i < count; i++) {
      const name = r.name();
      const type = r.u16();
      const cls = r.u16();
      const ttl = r.u32();
      const rdlen = r.u16();
      const rdata = r.slice(rdlen);
      rrs.push({ name, type, class: cls, ttl, rdata });
    }
    return rrs;
  }

  return {
    header,
    questions,
    answers: readRRs(ancnt),
    authority: readRRs(nscnt),
    additional: readRRs(arcnt),
    raw: buf,
  };
}

// ── RDATA builders ─────────────────────────────────────────────────────────

/** Encode an IPv4 address string as 4-byte RDATA. */
export function rdataA(ip: string): Buffer {
  const b = Buffer.alloc(4);
  const parts = ip.split(".").map(Number);
  b[0] = parts[0];
  b[1] = parts[1];
  b[2] = parts[2];
  b[3] = parts[3];
  return b;
}

/** Encode an IPv6 address as 16-byte RDATA. */
export function rdataAAAA(ip: string): Buffer {
  // Expand :: shorthand manually via Node's net module interpretation
  const groups = expandIPv6(ip);
  const b = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    b.writeUInt16BE(groups[i], i * 2);
  }
  return b;
}

function expandIPv6(ip: string): number[] {
  const halves = ip.split("::");
  const expand = (s: string) =>
    s ? s.split(":").map((g) => parseInt(g || "0", 16)) : [];
  if (halves.length === 2) {
    const left = expand(halves[0]);
    const right = expand(halves[1]);
    const mid = Array(8 - left.length - right.length).fill(0);
    return [...left, ...mid, ...right];
  }
  return expand(ip);
}

/** Encode a domain name pointer for NS/CNAME/MX RDATA. */
export function rdataName(name: string): Buffer {
  const w = new Writer();
  w.name(name);
  return w.build();
}

/** Encode SOA RDATA: mname rname serial refresh retry expire minimum */
export function rdataSOA(value: string): Buffer {
  const [mname, rname, serialS, refreshS, retryS, expireS, minimumS] =
    value.split(/\s+/);
  const w = new Writer();
  w.name(mname);
  w.name(rname);
  w.u32(parseInt(serialS));
  w.u32(parseInt(refreshS));
  w.u32(parseInt(retryS));
  w.u32(parseInt(expireS));
  w.u32(parseInt(minimumS));
  return w.build();
}

/** Encode TXT RDATA: one or more strings, each prefixed with 1-byte length. */
export function rdataTXT(value: string): Buffer {
  const parts: Buffer[] = [];
  // Split into 255-byte chunks
  const text = value.replace(/^"(.*)"$/, "$1");
  let offset = 0;
  while (offset < text.length) {
    const chunk = Buffer.from(text.slice(offset, offset + 255), "utf8");
    parts.push(Buffer.from([chunk.length]), chunk);
    offset += 255;
  }
  return Buffer.concat(parts);
}

/** Encode MX RDATA: 2-byte priority + domain name */
export function rdataMX(value: string, priority = 10): Buffer {
  const w = new Writer();
  w.u16(priority);
  w.name(value);
  return w.build();
}

/** Encode CAA RDATA: 1-byte flags, 1-byte tag length, tag, value */
export function rdataCAA(value: string): Buffer {
  // Format: "0 issue \"letsencrypt.org\""
  const parts = value.match(/^(\d+)\s+(\w+)\s+"?([^"]*)"?$/) || [];
  const flags = parseInt(parts[1] ?? "0");
  const tag = parts[2] ?? "issue";
  const val = parts[3] ?? "";
  const tagBuf = Buffer.from(tag, "ascii");
  const valBuf = Buffer.from(val, "ascii");
  const b = Buffer.alloc(2 + tagBuf.length + valBuf.length);
  b[0] = flags;
  b[1] = tagBuf.length;
  tagBuf.copy(b, 2);
  valBuf.copy(b, 2 + tagBuf.length);
  return b;
}

// ── Encode a full DNS response packet ─────────────────────────────────────

export interface EncodeOpts {
  id: number;
  opcode?: number;
  aa?: number;
  tc?: number;
  rd?: number;
  ra?: number;
  ad?: number;
  rcode?: number;
  questions: DnsQuestion[];
  answers: DnsRecord[];
  authority: DnsRecord[];
  additional: DnsRecord[];
}

export function encodePacket(opts: EncodeOpts): Buffer {
  const w = new Writer();

  const qr = 1;
  const opcode = opts.opcode ?? 0;
  const aa = opts.aa ?? 0;
  const tc = opts.tc ?? 0;
  const rd = opts.rd ?? 0;
  const ra = opts.ra ?? 0;
  const ad = opts.ad ?? 0;
  const cd = 0;
  const rcode = opts.rcode ?? 0;

  const flags =
    (qr << 15) |
    (opcode << 11) |
    (aa << 10) |
    (tc << 9) |
    (rd << 8) |
    (ra << 7) |
    (ad << 5) |
    (cd << 4) |
    rcode;

  w.u16(opts.id);
  w.u16(flags);
  w.u16(opts.questions.length);
  w.u16(opts.answers.length);
  w.u16(opts.authority.length);
  w.u16(opts.additional.length);

  for (const q of opts.questions) {
    w.name(q.name);
    w.u16(q.type);
    w.u16(q.class);
  }

  for (const sec of [opts.answers, opts.authority, opts.additional]) {
    for (const rr of sec) {
      w.name(rr.name);
      w.u16(rr.type);
      w.u16(rr.class);
      w.u32(rr.ttl);
      w.u16(rr.rdata.length);
      w.raw(rr.rdata);
    }
  }

  return w.build();
}

/** Build a minimal error response (FORMERR, SERVFAIL, etc.) */
export function errorPacket(
  id: number,
  rcode: number,
  questions: DnsQuestion[] = [],
): Buffer {
  return encodePacket({
    id,
    rcode,
    questions,
    answers: [],
    authority: [],
    additional: [],
  });
}

// ── EDNS0 OPT record ──────────────────────────────────────────────────────

export interface OPTRecord {
  udpSize: number;
  extRcode: number;
  version: number;
  dnssecOk: boolean;
  options: Array<{ code: number; data: Buffer }>;
}

export function parseOPT(rr: DnsRecord): OPTRecord {
  const udpSize = rr.class;
  const extRcode = (rr.ttl >>> 24) & 0xff;
  const version = (rr.ttl >>> 16) & 0xff;
  const dnssecOk = ((rr.ttl >>> 15) & 1) === 1;

  const options: Array<{ code: number; data: Buffer }> = [];
  let p = 0;
  while (p + 4 <= rr.rdata.length) {
    const code = rr.rdata.readUInt16BE(p);
    const len = rr.rdata.readUInt16BE(p + 2);
    const data = rr.rdata.slice(p + 4, p + 4 + len);
    options.push({ code, data });
    p += 4 + len;
  }

  return { udpSize, extRcode, version, dnssecOk, options };
}

export function buildOPT(
  udpSize: number,
  dnssecOk: boolean,
  options: Array<{ code: number; data: Buffer }>,
): DnsRecord {
  const flags = dnssecOk ? 0x8000 : 0;

  const parts: Buffer[] = [];
  for (const opt of options) {
    const hdr = Buffer.alloc(4);
    hdr.writeUInt16BE(opt.code, 0);
    hdr.writeUInt16BE(opt.data.length, 2);
    parts.push(hdr, opt.data);
  }

  return {
    name: ".",
    type: TYPE.OPT,
    class: udpSize,
    ttl: flags,
    rdata: Buffer.concat(parts),
  };
}

// ── ECS (EDNS Client Subnet, option code 8) ───────────────────────────────

export function parseECS(
  optData: Buffer,
): { address: string; sourcePrefix: number; family: number } | null {
  if (optData.length < 4) return null;
  const family = optData.readUInt16BE(0);
  const sourcePrefix = optData.readUInt8(2);
  // const scopePrefix  = optData.readUInt8(3);

  const addrBytes = optData.slice(4);
  if (family === 1) {
    // IPv4 — pad to 4 bytes
    const padded = Buffer.alloc(4);
    addrBytes.copy(padded, 0);
    const address = Array.from(padded).join(".");
    return { address, sourcePrefix, family };
  }
  if (family === 2) {
    // IPv6 — pad to 16 bytes, format as hex groups
    const padded = Buffer.alloc(16);
    addrBytes.copy(padded, 0);
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2)
      groups.push(padded.readUInt16BE(i).toString(16));
    const address = groups.join(":");
    return { address, sourcePrefix, family };
  }
  return null;
}

export function buildECSOption(
  address: string,
  sourcePrefix: number,
  scopePrefix: number,
  family: number,
): Buffer {
  let addrBuf: Buffer;
  if (family === 1) {
    const full = Buffer.alloc(4);
    address.split(".").forEach((o, i) => {
      full[i] = parseInt(o);
    });
    const bytesNeeded = Math.ceil(sourcePrefix / 8);
    addrBuf = full.slice(0, bytesNeeded);
  } else {
    addrBuf = Buffer.alloc(0);
  }

  const data = Buffer.alloc(4 + addrBuf.length);
  data.writeUInt16BE(family, 0);
  data[2] = sourcePrefix;
  data[3] = scopePrefix;
  addrBuf.copy(data, 4);
  return data;
}

// ── Canonical wire-format helpers (for DNSSEC signing) ────────────────────

/** Encode a name in canonical (uncompressed, lowercased) wire format. */
export function canonicalName(name: string): Buffer {
  const w = new Writer();
  w.name(name.toLowerCase());
  return w.build();
}

/**
 * Build canonical RDATA for signing.
 * For types with embedded names (NS, CNAME, SOA, MX), names must be
 * lowercased and uncompressed — which our rdataXXX helpers already do.
 */
export function canonicalWire(rr: DnsRecord): Buffer {
  const nameBuf = canonicalName(rr.name);
  const hdr = Buffer.alloc(10);
  hdr.writeUInt16BE(rr.type, 0);
  hdr.writeUInt16BE(rr.class, 2);
  hdr.writeUInt32BE(rr.ttl, 4);
  hdr.writeUInt16BE(rr.rdata.length, 8);
  return Buffer.concat([nameBuf, hdr, rr.rdata]);
}
