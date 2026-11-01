// dns-node/src/index.ts
import "dotenv/config";

// dns-node/src/zone.ts
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";

// dns-node/src/types.ts
var TYPE = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  OPT: 41,
  // EDNS0 pseudo-RR
  DS: 43,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  NSEC3: 50,
  NSEC3PARAM: 51,
  CAA: 257,
  ANY: 255
};
var TYPE_NAME = Object.fromEntries(
  Object.entries(TYPE).map(([k, v]) => [v, k])
);
var CLASS_IN = 1;
var OPCODE_QUERY = 0;
var RCODE_NOERROR = 0;
var RCODE_SERVFAIL = 2;
var RCODE_NXDOMAIN = 3;
var RCODE_NOTIMP = 4;
var RCODE_REFUSED = 5;

// dns-node/src/packet.ts
var Reader = class {
  constructor(buf) {
    this.buf = buf;
  }
  buf;
  pos = 0;
  u8() {
    return this.buf.readUInt8(this.pos++);
  }
  u16() {
    const v = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }
  slice(len) {
    const s = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return s;
  }
  /** Read a DNS name following RFC 1035 §3.1 compression. */
  name() {
    const labels = [];
    const visited = /* @__PURE__ */ new Set();
    let p = this.pos;
    let jumped = false;
    while (true) {
      if (p >= this.buf.length) break;
      const len = this.buf.readUInt8(p);
      if (len === 0) {
        if (!jumped) this.pos = p + 1;
        break;
      }
      if ((len & 192) === 192) {
        const offset = (len & 63) << 8 | this.buf.readUInt8(p + 1);
        if (!jumped) this.pos = p + 2;
        if (visited.has(offset)) break;
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
};
var Writer = class {
  parts = [];
  u8(v) {
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.parts.push(b);
  }
  u16(v) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(v, 0);
    this.parts.push(b);
  }
  u32(v) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(v, 0);
    this.parts.push(b);
  }
  raw(b) {
    this.parts.push(b);
  }
  /** Write a DNS name as uncompressed labels. */
  name(n) {
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
  build() {
    return Buffer.concat(this.parts);
  }
  byteLength() {
    return this.parts.reduce((s, b) => s + b.length, 0);
  }
};
function parsePacket(buf) {
  const r = new Reader(buf);
  const id = r.u16();
  const flags = r.u16();
  const qdcnt = r.u16();
  const ancnt = r.u16();
  const nscnt = r.u16();
  const arcnt = r.u16();
  const header = {
    id,
    qr: flags >> 15 & 1,
    opcode: flags >> 11 & 15,
    aa: flags >> 10 & 1,
    tc: flags >> 9 & 1,
    rd: flags >> 8 & 1,
    ra: flags >> 7 & 1,
    z: flags >> 6 & 1,
    ad: flags >> 5 & 1,
    cd: flags >> 4 & 1,
    rcode: flags & 15
  };
  const questions = [];
  for (let i = 0; i < qdcnt; i++) {
    const name = r.name();
    const type = r.u16();
    const cls = r.u16();
    questions.push({ name, type, class: cls });
  }
  function readRRs(count) {
    const rrs = [];
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
    raw: buf
  };
}
function rdataA(ip) {
  const b = Buffer.alloc(4);
  const parts = ip.split(".").map(Number);
  b[0] = parts[0];
  b[1] = parts[1];
  b[2] = parts[2];
  b[3] = parts[3];
  return b;
}
function rdataAAAA(ip) {
  const groups = expandIPv6(ip);
  const b = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    b.writeUInt16BE(groups[i], i * 2);
  }
  return b;
}
function expandIPv6(ip) {
  const halves = ip.split("::");
  const expand = (s) => s ? s.split(":").map((g) => parseInt(g || "0", 16)) : [];
  if (halves.length === 2) {
    const left = expand(halves[0]);
    const right = expand(halves[1]);
    const mid = Array(8 - left.length - right.length).fill(0);
    return [...left, ...mid, ...right];
  }
  return expand(ip);
}
function rdataName(name) {
  const w = new Writer();
  w.name(name);
  return w.build();
}
function rdataSOA(value) {
  const [mname, rname, serialS, refreshS, retryS, expireS, minimumS] = value.split(/\s+/);
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
function rdataTXT(value) {
  const parts = [];
  const text = value.replace(/^"(.*)"$/, "$1");
  let offset = 0;
  while (offset < text.length) {
    const chunk = Buffer.from(text.slice(offset, offset + 255), "utf8");
    parts.push(Buffer.from([chunk.length]), chunk);
    offset += 255;
  }
  return Buffer.concat(parts);
}
function rdataMX(value, priority = 10) {
  const w = new Writer();
  w.u16(priority);
  w.name(value);
  return w.build();
}
function rdataCAA(value) {
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
function encodePacket(opts) {
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
  const flags = qr << 15 | opcode << 11 | aa << 10 | tc << 9 | rd << 8 | ra << 7 | ad << 5 | cd << 4 | rcode;
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
function errorPacket(id, rcode, questions = []) {
  return encodePacket({
    id,
    rcode,
    questions,
    answers: [],
    authority: [],
    additional: []
  });
}
function parseOPT(rr) {
  const udpSize = rr.class;
  const extRcode = rr.ttl >>> 24 & 255;
  const version = rr.ttl >>> 16 & 255;
  const dnssecOk = (rr.ttl >>> 15 & 1) === 1;
  const options = [];
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
function buildOPT(udpSize, dnssecOk, options) {
  const flags = dnssecOk ? 32768 : 0;
  const parts = [];
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
    rdata: Buffer.concat(parts)
  };
}
function parseECS(optData) {
  if (optData.length < 4) return null;
  const family = optData.readUInt16BE(0);
  const sourcePrefix = optData.readUInt8(2);
  const addrBytes = optData.slice(4);
  if (family === 1) {
    const padded = Buffer.alloc(4);
    addrBytes.copy(padded, 0);
    const address = Array.from(padded).join(".");
    return { address, sourcePrefix, family };
  }
  if (family === 2) {
    const padded = Buffer.alloc(16);
    addrBytes.copy(padded, 0);
    const groups = [];
    for (let i = 0; i < 16; i += 2)
      groups.push(padded.readUInt16BE(i).toString(16));
    const address = groups.join(":");
    return { address, sourcePrefix, family };
  }
  return null;
}
function buildECSOption(address, sourcePrefix, scopePrefix, family) {
  let addrBuf;
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
function canonicalName(name) {
  const w = new Writer();
  w.name(name.toLowerCase());
  return w.build();
}
function canonicalWire(rr) {
  const nameBuf = canonicalName(rr.name);
  const hdr = Buffer.alloc(10);
  hdr.writeUInt16BE(rr.type, 0);
  hdr.writeUInt16BE(rr.class, 2);
  hdr.writeUInt32BE(rr.ttl, 4);
  hdr.writeUInt16BE(rr.rdata.length, 8);
  return Buffer.concat([nameBuf, hdr, rr.rdata]);
}

// dns-node/src/zone.ts
var ZONE_FILE = process.env.ZONE_FILE || path.join(process.cwd(), "dns-node", "data", "zone.json");
var ZONE_SYNC_URL = process.env.ZONE_SYNC_URL || "";
var ZONE_SYNC_INTERVAL = parseInt(process.env.ZONE_SYNC_INTERVAL_S || "120") * 1e3;
var zone = { domain: "", serial: 0, records: [] };
var compiled = /* @__PURE__ */ new Map();
var zoneLoaded = false;
function typeCode(typeName) {
  return TYPE[typeName.toUpperCase()] ?? 0;
}
function buildRdata(rec) {
  const v = Array.isArray(rec.value) ? rec.value[0] : rec.value;
  switch (rec.type.toUpperCase()) {
    case "A":
      return rdataA(v);
    case "AAAA":
      return rdataAAAA(v);
    case "NS":
    case "CNAME":
      return rdataName(v);
    case "SOA":
      return rdataSOA(v);
    case "TXT":
      return rdataTXT(v);
    case "MX":
      return rdataMX(v, rec.priority ?? 10);
    case "CAA":
      return rdataCAA(v);
    default:
      return null;
  }
}
function compile(data) {
  const map = /* @__PURE__ */ new Map();
  const domain = data.domain.toLowerCase();
  for (const rec of data.records) {
    const rdata = buildRdata(rec);
    if (!rdata) continue;
    const rawName = rec.name === "@" ? domain : rec.name === "*" ? `*.${domain}` : `${rec.name}.${domain}`;
    const key = `${rawName.toLowerCase()}|${rec.type.toUpperCase()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      name: rawName,
      type: typeCode(rec.type),
      class: CLASS_IN,
      ttl: rec.ttl,
      rdata
    });
  }
  return map;
}
function loadZoneFromFile() {
  try {
    const raw = fs.readFileSync(ZONE_FILE, "utf8");
    const data = JSON.parse(raw);
    zone = data;
    compiled = compile(data);
    zoneLoaded = true;
    console.log(
      `[zone] Loaded ${data.records.length} records for ${data.domain} (serial=${data.serial})`
    );
  } catch (err) {
    console.error(`[zone] Failed to load ${ZONE_FILE}: ${err.message}`);
  }
}
async function fetchZoneFromPrimary() {
  if (!ZONE_SYNC_URL) return;
  return new Promise((resolve) => {
    const mod = ZONE_SYNC_URL.startsWith("https") ? https : http;
    mod.get(ZONE_SYNC_URL, {
      headers: process.env.DNS_SYNC_SECRET ? { "X-DNS-Sync-Secret": process.env.DNS_SYNC_SECRET } : {},
      timeout: 1e4
    }, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[zone] Sync failed: HTTP ${res.statusCode}`);
        res.resume();
        resolve();
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          const data = JSON.parse(raw);
          if (!data || typeof data.domain !== "string" || !data.domain || zoneLoaded && data.domain !== zone.domain || !Number.isSafeInteger(data.serial) || !Array.isArray(data.records)) throw new Error("Invalid zone sync response");
          if (data.serial > zone.serial) {
            zone = data;
            compiled = compile(data);
            zoneLoaded = true;
            console.log(`[zone] Synced from primary: serial=${data.serial}`);
            fs.writeFileSync(ZONE_FILE, raw, "utf8");
          }
        } catch (err) {
          console.error(`[zone] Sync parse error: ${err.message}`);
        }
        resolve();
      });
      res.on("error", () => resolve());
    }).on("timeout", function() {
      this.destroy(new Error("Zone sync timed out"));
    }).on("error", (error) => {
      console.error(`[zone] Sync failed: ${error.message}`);
      resolve();
    });
  });
}
async function initZone() {
  loadZoneFromFile();
  if (ZONE_SYNC_URL) {
    await fetchZoneFromPrimary();
  }
  if (ZONE_SYNC_URL && ZONE_SYNC_INTERVAL > 0) {
    setInterval(() => fetchZoneFromPrimary(), ZONE_SYNC_INTERVAL);
  }
}
function normalize(name) {
  return name.toLowerCase().replace(/\.$/, "");
}
function isAuthoritative(name) {
  if (!zoneLoaded) return false;
  const n = normalize(name);
  const d = zone.domain.toLowerCase();
  return n === d || n.endsWith(`.${d}`);
}
function resolveRecords(name, typeName) {
  const n = normalize(name);
  const t = typeName.toUpperCase();
  const key = `${n}|${t}`;
  if (compiled.has(key)) return compiled.get(key);
  const domain = zone.domain.toLowerCase();
  const parts = n.split(".");
  if (parts.length > domain.split(".").length) {
    const wildcardKey = `*.${domain}|${t}`;
    const wc = compiled.get(wildcardKey);
    if (wc) {
      return wc.map((rr) => ({ ...rr, name }));
    }
  }
  return [];
}
function getSOA() {
  const key = `${zone.domain.toLowerCase()}|SOA`;
  return compiled.get(key)?.[0] ?? null;
}
function getNS() {
  const key = `${zone.domain.toLowerCase()}|NS`;
  return compiled.get(key) ?? [];
}
function getDomain() {
  return zone.domain;
}
function reloadZone() {
  loadZoneFromFile();
}

// dns-node/src/dnssec.ts
import crypto from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";
var KEY_DIR = process.env.DNSSEC_KEY_DIR || path2.join(process.cwd(), "dns-node", "keys");
var ALG = 13;
var KSK_FLAGS = 257;
var ZSK_FLAGS = 256;
var SIG_VALIDITY_DAYS = 30;
var NSEC3_ALGORITHM = 1;
var NSEC3_ITERATIONS = 0;
var ksk = null;
var zsk = null;
var zoneName = "";
var dnssecReady = false;
function computeKeyTag(rdata) {
  let ac = 0;
  for (let i = 0; i < rdata.length; i++) {
    ac += i & 1 ? rdata[i] : rdata[i] << 8;
  }
  ac += ac >> 16 & 65535;
  return ac & 65535;
}
function buildDnskeyRdata(flags, pubKeyRaw) {
  const hdr = Buffer.alloc(4);
  hdr.writeUInt16BE(flags, 0);
  hdr[2] = 3;
  hdr[3] = ALG;
  return Buffer.concat([hdr, pubKeyRaw]);
}
function pubKeyToRaw(pubPem) {
  const key = crypto.createPublicKey(pubPem);
  const exported = key.export({ type: "spki", format: "der" });
  const raw = exported.slice(-65);
  if (raw[0] !== 4)
    throw new Error("[DNSSEC] Unexpected P-256 public key format");
  return raw.slice(1);
}
function derToRaw(der) {
  let p = 2;
  if (der[1] === 129) p = 3;
  p++;
  const rLen = der[p++];
  let r = der.slice(p, p + rLen);
  p += rLen;
  if (r[0] === 0) r = r.slice(1);
  p++;
  const sLen = der[p++];
  let s = der.slice(p, p + sLen);
  if (s[0] === 0) s = s.slice(1);
  const rPad = Buffer.alloc(32);
  r.copy(rPad, 32 - r.length);
  const sPad = Buffer.alloc(32);
  s.copy(sPad, 32 - s.length);
  return Buffer.concat([rPad, sPad]);
}
function generateKeyPair(flags) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256"
  });
  const privPem = privateKey.export({ type: "sec1", format: "pem" });
  const pubPem = publicKey.export({ type: "spki", format: "pem" });
  const pubRaw = pubKeyToRaw(pubPem);
  const rdata = buildDnskeyRdata(flags, pubRaw);
  const keyTag = computeKeyTag(rdata);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3);
  return {
    isKsk: flags === KSK_FLAGS,
    flags,
    algorithm: ALG,
    keyTag,
    privateKeyPem: privPem,
    publicKeyPem: pubPem,
    publicKeyRaw: pubRaw,
    expiresAt
  };
}
function saveKeys(zone2) {
  fs2.mkdirSync(KEY_DIR, { recursive: true });
  for (const [prefix, kp] of [
    ["ksk", ksk],
    ["zsk", zsk]
  ]) {
    fs2.writeFileSync(
      path2.join(KEY_DIR, `${prefix}.priv.pem`),
      kp.privateKeyPem
    );
    fs2.writeFileSync(path2.join(KEY_DIR, `${prefix}.pub.pem`), kp.publicKeyPem);
  }
  fs2.writeFileSync(
    path2.join(KEY_DIR, "key-meta.json"),
    JSON.stringify(
      {
        zone: zone2,
        kskTag: ksk.keyTag,
        zskTag: zsk.keyTag,
        algorithm: ALG,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        expiresAt: ksk.expiresAt.toISOString()
      },
      null,
      2
    )
  );
}
function loadKeys() {
  const kskPriv = path2.join(KEY_DIR, "ksk.priv.pem");
  const kskPub = path2.join(KEY_DIR, "ksk.pub.pem");
  const zskPriv = path2.join(KEY_DIR, "zsk.priv.pem");
  const zskPub = path2.join(KEY_DIR, "zsk.pub.pem");
  if (!fs2.existsSync(kskPriv)) return false;
  try {
    const makeKP = (priv, pub, flags) => {
      const privPem = fs2.readFileSync(priv, "utf8");
      const pubPem = fs2.readFileSync(pub, "utf8");
      const pubRaw = pubKeyToRaw(pubPem);
      const rdata = buildDnskeyRdata(flags, pubRaw);
      const keyTag = computeKeyTag(rdata);
      const meta = JSON.parse(
        fs2.readFileSync(path2.join(KEY_DIR, "key-meta.json"), "utf8")
      );
      return {
        isKsk: flags === KSK_FLAGS,
        flags,
        algorithm: ALG,
        keyTag,
        privateKeyPem: privPem,
        publicKeyPem: pubPem,
        publicKeyRaw: pubRaw,
        expiresAt: new Date(meta.expiresAt)
      };
    };
    ksk = makeKP(kskPriv, kskPub, KSK_FLAGS);
    zsk = makeKP(zskPriv, zskPub, ZSK_FLAGS);
    return true;
  } catch {
    return false;
  }
}
function initDnssec(zone2) {
  zoneName = zone2.toLowerCase();
  if (!zoneName.endsWith(".")) zoneName += ".";
  if (!loadKeys()) {
    console.log("[DNSSEC] Generating new KSK + ZSK key pairs...");
    ksk = generateKeyPair(KSK_FLAGS);
    zsk = generateKeyPair(ZSK_FLAGS);
    saveKeys(zone2);
    console.log(`[DNSSEC] KSK tag=${ksk.keyTag}  ZSK tag=${zsk.keyTag}`);
  } else {
    console.log(
      `[DNSSEC] Keys loaded \u2014 KSK tag=${ksk.keyTag}  ZSK tag=${zsk.keyTag}`
    );
  }
  dnssecReady = true;
}
function isDnssecReady() {
  return dnssecReady;
}
function getKsk() {
  return ksk;
}
function getZsk() {
  return zsk;
}
function getDnskeyRecords(zone2) {
  if (!ksk || !zsk) return [];
  const make = (kp) => ({
    name: zone2.replace(/\.$/, ""),
    type: TYPE.DNSKEY,
    class: CLASS_IN,
    ttl: 3600,
    rdata: buildDnskeyRdata(kp.flags, kp.publicKeyRaw)
  });
  return [make(ksk), make(zsk)];
}
function signRRset(rrset, typeCovered) {
  if (!ksk || !zsk || rrset.length === 0) return null;
  const signerKey = typeCovered === TYPE.DNSKEY ? ksk : zsk;
  const ownName = rrset[0].name;
  const labels = ownName.split(".").filter(Boolean).length;
  const ttl = rrset[0].ttl;
  const now = Math.floor(Date.now() / 1e3);
  const inception = now - 300;
  const expiration = now + SIG_VALIDITY_DAYS * 86400;
  const zoneNameWire = canonicalName(zoneName);
  const signerNameBuf = zoneNameWire;
  const rrsigHeader = Buffer.alloc(18 + signerNameBuf.length);
  rrsigHeader.writeUInt16BE(typeCovered, 0);
  rrsigHeader[2] = ALG;
  rrsigHeader[3] = labels;
  rrsigHeader.writeUInt32BE(ttl, 4);
  rrsigHeader.writeUInt32BE(expiration, 8);
  rrsigHeader.writeUInt32BE(inception, 12);
  rrsigHeader.writeUInt16BE(signerKey.keyTag, 16);
  signerNameBuf.copy(rrsigHeader, 18);
  const sorted = [...rrset].sort((a, b) => a.rdata.compare(b.rdata));
  const parts = [rrsigHeader, ...sorted.map(canonicalWire)];
  const toSign = Buffer.concat(parts);
  let sigDer;
  try {
    const privKey = crypto.createPrivateKey(signerKey.privateKeyPem);
    sigDer = crypto.sign("SHA256", toSign, {
      key: privKey,
      dsaEncoding: "der"
    });
  } catch {
    return null;
  }
  const sigRaw = derToRaw(sigDer);
  const rdata = Buffer.concat([rrsigHeader, sigRaw]);
  return {
    name: ownName,
    type: TYPE.RRSIG,
    class: CLASS_IN,
    ttl,
    rdata
  };
}
function getDSRecord(zone2) {
  if (!ksk) return null;
  const ownerWire = canonicalName(zone2.endsWith(".") ? zone2 : `${zone2}.`);
  const rdata = buildDnskeyRdata(ksk.flags, ksk.publicKeyRaw);
  const digest = crypto.createHash("sha256").update(Buffer.concat([ownerWire, rdata])).digest();
  const dsRdata = Buffer.alloc(4 + digest.length);
  dsRdata.writeUInt16BE(ksk.keyTag, 0);
  dsRdata[2] = ALG;
  dsRdata[3] = 2;
  digest.copy(dsRdata, 4);
  return {
    name: zone2.replace(/\.$/, ""),
    type: TYPE.DS,
    class: CLASS_IN,
    ttl: 3600,
    rdata: dsRdata
  };
}
var BASE32HEX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32encode(buf) {
  let bits = 0, val = 0, out = "";
  for (const byte of buf) {
    val = val << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32HEX[val >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32HEX[val << 5 - bits & 31];
  return out.toLowerCase();
}
function nsec3Hash(name, salt, iterations) {
  const nameLower = name.toLowerCase();
  const wire = canonicalName(
    nameLower.endsWith(".") ? nameLower : `${nameLower}.`
  );
  let hash = Buffer.concat([wire, salt]);
  for (let i = 0; i <= iterations; i++) {
    hash = crypto.createHash("sha1").update(hash).digest();
    if (i < iterations) hash = Buffer.concat([hash, salt]);
  }
  return hash;
}
function nsec3HashedOwner(name, zone2, salt) {
  const h = nsec3Hash(name, salt, NSEC3_ITERATIONS);
  return `${base32encode(h)}.${zone2.replace(/\.$/, "")}`;
}
function buildNsec3ParamRdata(salt) {
  const b = Buffer.alloc(5 + salt.length);
  b[0] = NSEC3_ALGORITHM;
  b[1] = 0;
  b.writeUInt16BE(NSEC3_ITERATIONS, 2);
  b[4] = salt.length;
  salt.copy(b, 5);
  return b;
}
function buildTypeBitmap(types) {
  const windows = /* @__PURE__ */ new Map();
  for (const t of types) {
    const win = t >> 8;
    const bit = t & 255;
    if (!windows.has(win)) windows.set(win, []);
    windows.get(win).push(bit);
  }
  const parts = [];
  for (const [win, bits] of [...windows.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const maxBit = Math.max(...bits);
    const len = Math.ceil((maxBit + 1) / 8);
    const bm = Buffer.alloc(len);
    for (const b of bits) bm[b >> 3] |= 1 << 7 - (b & 7);
    parts.push(Buffer.from([win, len]), bm);
  }
  return Buffer.concat(parts);
}
function buildNsec3Rdata(salt, nextHash, types) {
  const bitmap = buildTypeBitmap(types);
  const b = Buffer.alloc(5 + salt.length + 1 + nextHash.length + bitmap.length);
  let p = 0;
  b[p++] = NSEC3_ALGORITHM;
  b[p++] = 0;
  b.writeUInt16BE(NSEC3_ITERATIONS, p);
  p += 2;
  b[p++] = salt.length;
  salt.copy(b, p);
  p += salt.length;
  b[p++] = nextHash.length;
  nextHash.copy(b, p);
  p += nextHash.length;
  bitmap.copy(b, p);
  return b;
}
function getZoneSalt(zone2) {
  return crypto.createHash("sha256").update(`nsec3-salt:${zone2}`).digest().slice(0, 8);
}

// dns-node/src/geodns.ts
import fs3 from "node:fs";
import path3 from "node:path";
var GEODNS_ENABLED = process.env.GEODNS_ENABLED === "true";
var DNS_SERVER_IP = process.env.DNS_SERVER_IP || "34.117.33.233";
var GEODB_PATH = process.env.GEODB_PATH || path3.join(process.cwd(), "data", "GeoLite2-Country.mmdb");
var regionMap = { default: DNS_SERVER_IP };
try {
  if (process.env.REGION_MAP) {
    regionMap = { ...regionMap, ...JSON.parse(process.env.REGION_MAP) };
  }
} catch {
  console.warn(
    "[GeoDNS] Invalid REGION_MAP JSON \u2014 using single IP for all regions"
  );
}
var reader = null;
var loading = null;
async function getReader() {
  if (reader) return reader;
  if (loading) return loading;
  if (!fs3.existsSync(GEODB_PATH)) {
    console.info(
      `[GeoDNS] Database not found at ${GEODB_PATH}. GeoDNS disabled.`
    );
    return null;
  }
  loading = (async () => {
    try {
      const { default: maxmind } = await import("maxmind");
      reader = await maxmind.open(GEODB_PATH);
      console.info(`[GeoDNS] Loaded ${GEODB_PATH}`);
      return reader;
    } catch (err) {
      console.warn(`[GeoDNS] Failed to open mmdb: ${err.message}`);
      loading = null;
      return null;
    }
  })();
  return loading;
}
function isPrivate(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.") || ip.startsWith("fc00:") || ip.startsWith("fe80:");
}
async function lookupGeo(ip) {
  if (!GEODNS_ENABLED || isPrivate(ip)) return null;
  const r = await getReader();
  if (!r) return null;
  try {
    const record = r.get(ip);
    const continent = record?.continent?.code ?? "default";
    const country = record?.country?.iso_code ?? "";
    return { continent, country, ip };
  } catch {
    return null;
  }
}
function selectRegionIp(geo) {
  if (!geo) return regionMap.default ?? DNS_SERVER_IP;
  return regionMap[geo.continent] ?? regionMap.default ?? DNS_SERVER_IP;
}
async function resolveGeoIP(clientIp) {
  if (!GEODNS_ENABLED) return DNS_SERVER_IP;
  const geo = await lookupGeo(clientIp);
  return selectRegionIp(geo);
}
async function warmGeoDb() {
  if (!GEODNS_ENABLED) return;
  const r = await getReader();
  if (r) {
    const testGeo = await lookupGeo("8.8.8.8");
    console.info(`[GeoDNS] Warm \u2014 8.8.8.8 \u2192 ${testGeo?.continent ?? "n/a"}`);
  }
}

// dns-node/src/server.ts
import dgram from "node:dgram";
import net from "node:net";
import https2 from "node:https";
import http2 from "node:http";
var DNS_PORT = parseInt(process.env.DNS_PORT || "5353");
var DNS_HOST = process.env.DNS_HOST || "0.0.0.0";
var DNS_SERVER_IP2 = process.env.DNS_SERVER_IP || "34.117.33.233";
var DNSSEC_ENABLED = process.env.DNSSEC_ENABLED === "true";
var MAX_UDP_SIZE = 4096;
var DOH_UPSTREAM = process.env.DOH_UPSTREAM || "https://cloudflare-dns.com/dns-query";
var queryCount = 0;
var startTime = Date.now();
function getQueryCount() {
  return queryCount;
}
function getUptimeSeconds() {
  return (Date.now() - startTime) / 1e3;
}
async function dohForward(rawQuery) {
  return new Promise((resolve) => {
    const url = new URL(DOH_UPSTREAM);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        Accept: "application/dns-message",
        "Content-Length": rawQuery.length.toString()
      }
    };
    const mod = url.protocol === "https:" ? https2 : http2;
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8e3, () => {
      req.destroy();
      resolve(null);
    });
    req.write(rawQuery);
    req.end();
  });
}
async function processQuery(rawQuery, clientIp) {
  queryCount++;
  let pkt;
  try {
    pkt = parsePacket(rawQuery);
  } catch {
    return errorPacket(
      0,
      1
      /* FORMERR */
    );
  }
  const { id, rd } = pkt.header;
  if (pkt.header.opcode !== OPCODE_QUERY) {
    return errorPacket(id, RCODE_NOTIMP, pkt.questions);
  }
  if (pkt.questions.length === 0) {
    return errorPacket(id, 1, pkt.questions);
  }
  const q = pkt.questions[0];
  const qname = q.name.toLowerCase().replace(/\.$/, "");
  const qtype = q.type;
  const optRR = pkt.additional.find((rr) => rr.type === TYPE.OPT);
  const edns = optRR ? parseOPT(optRR) : null;
  const doBit = edns?.dnssecOk ?? false;
  const udpSize = edns?.udpSize ?? 512;
  let ecsInfo = null;
  if (edns) {
    for (const opt of edns.options) {
      if (opt.code === 8) {
        ecsInfo = parseECS(opt.data);
        break;
      }
    }
  }
  const effectiveClientIp = ecsInfo?.address || clientIp;
  if (!isAuthoritative(qname)) {
    if (!rd) return errorPacket(id, RCODE_REFUSED, pkt.questions);
    const resp2 = await dohForward(rawQuery);
    if (resp2) return resp2;
    return errorPacket(id, RCODE_SERVFAIL, pkt.questions);
  }
  const zone2 = getDomain();
  const zoneSalt = getZoneSalt(zone2);
  let answers = [];
  let authority = [];
  let additional = [];
  let rcode = RCODE_NOERROR;
  let aa = 1;
  if (qtype === TYPE.DNSKEY) {
    answers = getDnskeyRecords(zone2);
    if (answers.length === 0) rcode = RCODE_NOERROR;
  } else if (qtype === TYPE.DS) {
    const ds = getDSRecord(zone2);
    if (ds) answers = [ds];
  } else if (qtype === TYPE.NSEC3PARAM) {
    answers = [
      {
        name: zone2,
        type: TYPE.NSEC3PARAM,
        class: CLASS_IN,
        ttl: 3600,
        rdata: buildNsec3ParamRdata(zoneSalt)
      }
    ];
  } else {
    const typeName = TYPE_NAME[qtype] || "";
    let recs = resolveRecords(qname, typeName);
    if (qtype === TYPE.A && recs.length > 0) {
      const geoIp = await resolveGeoIP(effectiveClientIp);
      if (geoIp !== DNS_SERVER_IP2) {
        recs = recs.map((rr) => ({ ...rr, rdata: rdataA(geoIp) }));
      }
    }
    if (recs.length > 0) {
      answers = recs;
    } else {
      if (qtype !== TYPE.A && qtype !== TYPE.NS) {
        const aRecs = resolveRecords(qname, "A");
        if (aRecs.length === 0 && !isAuthoritative(qname)) {
          rcode = RCODE_NXDOMAIN;
        } else if (aRecs.length === 0) {
          rcode = RCODE_NOERROR;
        }
      } else if (qtype === TYPE.A || qtype === TYPE.NS) {
        const soaRec = getSOA();
        rcode = RCODE_NXDOMAIN;
        if (soaRec) authority = [soaRec];
      }
    }
  }
  if (rcode === RCODE_NOERROR && answers.length === 0 && qtype !== TYPE.DNSKEY) {
    const soa = getSOA();
    if (soa) authority = [soa];
  }
  if (rcode === RCODE_NOERROR && answers.length > 0 && qtype !== TYPE.DNSKEY && qtype !== TYPE.NS) {
    authority = getNS();
  }
  if (DNSSEC_ENABLED && isDnssecReady() && doBit) {
    if (answers.length > 0) {
      const rrsig = signRRset(answers, qtype);
      if (rrsig) answers.push(rrsig);
    }
    if (qtype === TYPE.DNSKEY && answers.length > 0) {
      const kskRrsig = signRRset(
        answers.filter((r) => r.type === TYPE.DNSKEY),
        TYPE.DNSKEY
      );
      if (kskRrsig) answers.push(kskRrsig);
    }
    if (rcode === RCODE_NXDOMAIN) {
      const allNames = [zone2, `*.${zone2}`];
      const hashes = allNames.map((n) => ({
        name: n,
        hash: nsec3Hash(n, zoneSalt, NSEC3_ITERATIONS)
      }));
      hashes.sort((a, b) => a.hash.compare(b.hash));
      const queryHash = nsec3Hash(qname, zoneSalt, NSEC3_ITERATIONS);
      const nsec3Rr = {
        name: nsec3HashedOwner(zone2, zone2, zoneSalt),
        type: TYPE.NSEC3,
        class: CLASS_IN,
        ttl: 300,
        rdata: buildNsec3Rdata(zoneSalt, hashes[0].hash, [
          TYPE.A,
          TYPE.NS,
          TYPE.SOA,
          TYPE.DNSKEY
        ])
      };
      authority.push(nsec3Rr);
    }
  }
  const additionalRrs = [...additional];
  if (edns) {
    const respOptions = [];
    if (ecsInfo) {
      const geo = await lookupGeo(ecsInfo.address);
      const scope = geo ? ecsInfo.sourcePrefix : 0;
      respOptions.push({
        code: 8,
        data: buildECSOption(
          ecsInfo.address,
          ecsInfo.sourcePrefix,
          scope,
          ecsInfo.family
        )
      });
    }
    additionalRrs.push(
      buildOPT(Math.min(udpSize, MAX_UDP_SIZE), doBit, respOptions)
    );
  }
  const resp = encodePacket({
    id,
    aa,
    rd,
    rcode,
    questions: pkt.questions,
    answers,
    authority,
    additional: additionalRrs
  });
  const limit = edns ? Math.min(udpSize, MAX_UDP_SIZE) : 512;
  if (resp.length > limit) {
    return encodePacket({
      id,
      aa,
      tc: 1,
      rd,
      rcode: RCODE_NOERROR,
      questions: pkt.questions,
      answers: [],
      authority: [],
      additional: []
    });
  }
  return resp;
}
function startUDP() {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    sock.on("error", (err) => {
      console.error(`[DNS/UDP] Error: ${err.message}`);
      reject(err);
    });
    sock.on("message", async (msg, rinfo) => {
      try {
        const resp = await processQuery(msg, rinfo.address);
        sock.send(resp, rinfo.port, rinfo.address);
      } catch (err) {
        console.error(`[DNS/UDP] processQuery error: ${err.message}`);
      }
    });
    sock.bind(DNS_PORT, DNS_HOST, () => {
      console.log(`[DNS/UDP] Listening on ${DNS_HOST}:${DNS_PORT}`);
      resolve(sock);
    });
  });
}
function startTCP() {
  const server = net.createServer((socket) => {
    const clientIp = socket.remoteAddress?.replace("::ffff:", "") ?? "0.0.0.0";
    let rxBuf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      rxBuf = Buffer.concat([rxBuf, chunk]);
      while (rxBuf.length >= 2) {
        const msgLen = rxBuf.readUInt16BE(0);
        if (rxBuf.length < 2 + msgLen) break;
        const query = rxBuf.slice(2, 2 + msgLen);
        rxBuf = rxBuf.slice(2 + msgLen);
        processQuery(query, clientIp).then((resp) => {
          const hdr = Buffer.alloc(2);
          hdr.writeUInt16BE(resp.length, 0);
          socket.write(Buffer.concat([hdr, resp]));
        }).catch((err) => {
          console.error(`[DNS/TCP] processQuery error: ${err.message}`);
          socket.destroy();
        });
      }
    });
    socket.on("error", () => socket.destroy());
    socket.setTimeout(3e4, () => socket.destroy());
  });
  server.listen(DNS_PORT, DNS_HOST, () => {
    console.log(`[DNS/TCP] Listening on ${DNS_HOST}:${DNS_PORT}`);
  });
  server.on("error", (err) => {
    console.error(`[DNS/TCP] Server error: ${err.message}`);
  });
  return server;
}
var udpSocket = null;
var tcpServer = null;
async function startDnsServer() {
  udpSocket = await startUDP();
  tcpServer = startTCP();
}
function stopDnsServer() {
  udpSocket?.close();
  tcpServer?.close();
}
function isDnsRunning() {
  return udpSocket !== null;
}

// dns-node/src/health.ts
import http3 from "node:http";
import { execSync } from "node:child_process";
var HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "5380");
var HEALTH_HOST = process.env.HEALTH_HOST || "0.0.0.0";
var ROLE = process.env.DNS_SERVER_ROLE || "ns1";
var DNS_PORT2 = parseInt(process.env.DNS_PORT || "5353");
var VERSION = "3.0.0";
var BGP_IF = process.env.ANYCAST0_IF || "anycast0";
var BGP_FAIL_THRESH = parseInt(process.env.BGP_FAIL_THRESH || "3");
var BGP_ENABLED = process.env.BGP_ENABLED === "true";
var consecutiveFailures = 0;
var bgpRouteActive = true;
function setAnycastRoute(up) {
  if (!BGP_ENABLED) return;
  try {
    execSync(`ip link set ${BGP_IF} ${up ? "up" : "down"}`, { timeout: 5e3 });
    bgpRouteActive = up;
    console.log(
      `[BGP] anycast0 ${up ? "UP" : "DOWN"} \u2014 route ${up ? "advertised" : "withdrawn"}`
    );
  } catch {
  }
}
function checkBgpHealth(healthy) {
  if (!BGP_ENABLED) return;
  if (healthy) {
    if (!bgpRouteActive) {
      consecutiveFailures = 0;
      setAnycastRoute(true);
    }
  } else {
    consecutiveFailures++;
    if (consecutiveFailures >= BGP_FAIL_THRESH && bgpRouteActive) {
      console.warn(
        `[BGP] ${BGP_FAIL_THRESH} consecutive failures \u2014 withdrawing anycast route`
      );
      setAnycastRoute(false);
    }
  }
}
function respond(res, status, body, ct = "application/json") {
  res.writeHead(status, {
    "Content-Type": ct,
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}
function handler(req, res) {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const method = req.method ?? "GET";
  if (url.pathname === "/health" && method === "GET") {
    const ok = isDnsRunning();
    checkBgpHealth(ok);
    respond(
      res,
      ok ? 200 : 503,
      JSON.stringify({
        ok,
        role: ROLE,
        port: DNS_PORT2,
        domain: getDomain(),
        uptime: Math.floor(getUptimeSeconds()),
        queries: getQueryCount(),
        version: VERSION,
        bgp: BGP_ENABLED ? { active: bgpRouteActive, failures: consecutiveFailures } : void 0
      })
    );
    return;
  }
  if (url.pathname === "/metrics" && method === "GET") {
    const lines = [
      `# HELP dns_queries_total Total DNS queries handled`,
      `# TYPE dns_queries_total counter`,
      `dns_queries_total{role="${ROLE}"} ${getQueryCount()}`,
      `# HELP dns_uptime_seconds DNS server uptime in seconds`,
      `# TYPE dns_uptime_seconds gauge`,
      `dns_uptime_seconds{role="${ROLE}"} ${getUptimeSeconds().toFixed(2)}`,
      `# HELP dns_server_up 1 if DNS server is running`,
      `# TYPE dns_server_up gauge`,
      `dns_server_up{role="${ROLE}"} ${isDnsRunning() ? 1 : 0}`
    ];
    respond(res, 200, lines.join("\n"), "text/plain");
    return;
  }
  if (url.pathname === "/reload" && method === "POST") {
    try {
      reloadZone();
      respond(
        res,
        200,
        JSON.stringify({ ok: true, message: "Zone reloaded from disk" })
      );
    } catch (err) {
      respond(res, 500, JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }
  if (url.pathname === "/ds-record" && method === "GET") {
    const ksk2 = getKsk();
    const zsk2 = getZsk();
    const ds = getDSRecord(getDomain());
    if (!ksk2 || !ds) {
      respond(
        res,
        503,
        JSON.stringify({ ok: false, error: "DNSSEC not initialized" })
      );
      return;
    }
    respond(
      res,
      200,
      JSON.stringify({
        ok: true,
        kskTag: ksk2.keyTag,
        zskTag: zsk2?.keyTag,
        dsRecord: {
          keyTag: ksk2.keyTag,
          algorithm: ksk2.algorithm,
          digestType: 2,
          digest: ds.rdata.slice(4).toString("hex")
        },
        registrarFormat: `${getDomain()} IN DS ${ksk2.keyTag} ${ksk2.algorithm} 2 ${ds.rdata.slice(4).toString("hex")}`
      })
    );
    return;
  }
  respond(res, 404, JSON.stringify({ error: "Not found" }));
}
function startHealthServer() {
  const server = http3.createServer(handler);
  server.listen(HEALTH_PORT, HEALTH_HOST, () => {
    console.log(
      `[Health] HTTP server on ${HEALTH_HOST}:${HEALTH_PORT} (role=${ROLE})`
    );
  });
  server.on("error", (err) => {
    console.error(`[Health] Server error: ${err.message}`);
  });
}

// dns-node/src/index.ts
var ROLE2 = process.env.DNS_SERVER_ROLE || "ns1";
var PORT = parseInt(process.env.DNS_PORT || "5353");
var HEALTH = parseInt(process.env.HEALTH_PORT || "5380");
var DNSSEC_ENABLED2 = process.env.DNSSEC_ENABLED === "true";
var HEARTBEAT_MS = 6e4;
var BANNER = `
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
  Max Booster DNS Node \u2014 v3.0.0
  Role: ${ROLE2.toUpperCase()}   Port: ${PORT}   Health: ${HEALTH}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`;
async function main() {
  console.log(BANNER);
  console.log(`[${ROLE2}] Starting up...`);
  await initZone();
  const domain = getDomain();
  console.log(`[${ROLE2}] Zone: ${domain}`);
  if (DNSSEC_ENABLED2) {
    initDnssec(domain);
    console.log(`[${ROLE2}] DNSSEC: enabled (ECDSAP256SHA256)`);
  } else {
    console.log(
      `[${ROLE2}] DNSSEC: disabled (set DNSSEC_ENABLED=true to enable)`
    );
  }
  await warmGeoDb();
  await startDnsServer();
  if (!isDnsRunning()) {
    console.error(
      `[${ROLE2}] \u274C DNS server failed to start on :${PORT}. Exiting.`
    );
    process.exit(1);
  }
  startHealthServer();
  console.log(
    `[${ROLE2}] \u2705 Online \u2014 ${domain} UDP+TCP :${PORT}  Health: :${HEALTH}`
  );
  setInterval(() => {
    console.log(
      `[${ROLE2}] \u{1F493} alive \u2014 queries=${getQueryCount()} uptime=${Math.floor(process.uptime())}s`
    );
  }, HEARTBEAT_MS);
  const shutdown = (sig) => {
    console.log(`[${ROLE2}] ${sig} received \u2014 shutting down`);
    stopDnsServer();
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    console.error(`[${ROLE2}] Uncaught exception:`, err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error(`[${ROLE2}] Unhandled rejection:`, reason);
  });
}
main().catch((err) => {
  console.error("[dns-node] Fatal startup error:", err);
  process.exit(1);
});
