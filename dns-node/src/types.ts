/**
 * dns-node — DNS type codes, opcodes, rcodes, and shared interfaces.
 * RFC 1035, RFC 3596, RFC 4034, RFC 5155.
 */

// ── Numeric type codes ─────────────────────────────────────────────────────

export const TYPE: Record<string, number> = {
  A:          1,
  NS:         2,
  CNAME:      5,
  SOA:        6,
  MX:         15,
  TXT:        16,
  AAAA:       28,
  SRV:        33,
  OPT:        41,   // EDNS0 pseudo-RR
  DS:         43,
  RRSIG:      46,
  NSEC:       47,
  DNSKEY:     48,
  NSEC3:      50,
  NSEC3PARAM: 51,
  CAA:        257,
  ANY:        255,
};

export const TYPE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TYPE).map(([k, v]) => [v, k])
);

export const CLASS_IN = 1;
export const CLASS_ANY = 255;

export const OPCODE_QUERY  = 0;
export const OPCODE_IQUERY = 1;
export const OPCODE_STATUS = 2;

export const RCODE_NOERROR  = 0;
export const RCODE_FORMERR  = 1;
export const RCODE_SERVFAIL = 2;
export const RCODE_NXDOMAIN = 3;
export const RCODE_NOTIMP   = 4;
export const RCODE_REFUSED  = 5;

// ── DNS packet structures ──────────────────────────────────────────────────

export interface DnsHeader {
  id:       number;
  qr:       number;   // 0=query, 1=response
  opcode:   number;
  aa:       number;   // authoritative answer
  tc:       number;   // truncated
  rd:       number;   // recursion desired
  ra:       number;   // recursion available
  z:        number;
  ad:       number;   // authentic data (DNSSEC)
  cd:       number;   // checking disabled
  rcode:    number;
}

export interface DnsQuestion {
  name:   string;
  type:   number;
  class:  number;
}

export interface DnsRecord {
  name:   string;
  type:   number;
  class:  number;
  ttl:    number;
  rdata:  Buffer;
}

export interface DnsPacket {
  header:     DnsHeader;
  questions:  DnsQuestion[];
  answers:    DnsRecord[];
  authority:  DnsRecord[];
  additional: DnsRecord[];
  /** Raw binary buffer (set after parse or encode) */
  raw?:       Buffer;
}

// ── Zone record (loaded from zone.json) ───────────────────────────────────

export interface ZoneRecord {
  name:  string;       // "@" = apex, "*" = wildcard, "sub" = subdomain
  type:  string;       // "A", "NS", "SOA", etc.
  ttl:   number;
  value: string | string[];  // string for most, string[] for TXT/MX with priority
  /** Optional: MX priority */
  priority?: number;
}

export interface ZoneData {
  domain:  string;
  serial:  number;
  records: ZoneRecord[];
}

// ── EDNS0 Client Subnet option ─────────────────────────────────────────────

export interface ECSInfo {
  family:       number;   // 1=IPv4, 2=IPv6
  sourcePrefix: number;
  scopePrefix:  number;
  address:      string;
}

// ── DNSSEC key pair ───────────────────────────────────────────────────────

export interface DnsKeyPair {
  isKsk:         boolean;
  flags:         number;
  algorithm:     number;
  keyTag:        number;
  privateKeyPem: string;
  publicKeyPem:  string;
  publicKeyRaw:  Buffer;   // raw 64-byte P-256 point (no 0x04 prefix)
  expiresAt:     Date;
}
