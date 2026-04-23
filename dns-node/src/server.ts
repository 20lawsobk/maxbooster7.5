/**
 * dns-node — Core DNS Server.
 *
 * UDP + TCP listeners built directly on Node's dgram and net modules.
 * No dns2 or any other DNS library dependency.
 *
 * Query processing pipeline:
 *   1. Parse raw bytes → DnsPacket
 *   2. Look up question in zone (authoritative) or forward upstream (DoH)
 *   3. GeoDNS: replace A record value with geo-targeted IP if enabled
 *   4. DNSSEC: sign answer RRset if DO bit set + DNSSEC_ENABLED
 *   5. Encode response → raw bytes → send
 */

import dgram   from 'node:dgram';
import net     from 'node:net';
import https   from 'node:https';
import http    from 'node:http';
import { EventEmitter } from 'node:events';

import { TYPE, TYPE_NAME, CLASS_IN, RCODE_NOERROR, RCODE_NXDOMAIN, RCODE_SERVFAIL, RCODE_REFUSED, RCODE_NOTIMP, OPCODE_QUERY } from './types.js';
import { parsePacket, encodePacket, errorPacket, parseOPT, buildOPT, parseECS, buildECSOption, rdataA } from './packet.js';
import { resolveRecords, isAuthoritative, getSOA, getNS, getDomain } from './zone.js';
import { signRRset, getDnskeyRecords, getDSRecord, isDnssecReady, getZoneSalt, buildNsec3Rdata, buildNsec3ParamRdata, nsec3Hash, nsec3HashedOwner, buildTypeBitmap, NSEC3_ALGORITHM, NSEC3_ITERATIONS } from './dnssec.js';
import { resolveGeoIP, lookupGeo, selectRegionIp } from './geodns.js';
import type { DnsPacket, DnsRecord, DnsQuestion, DnsHeader } from './types.js';

// ── Config ─────────────────────────────────────────────────────────────────

const DNS_PORT     = parseInt(process.env.DNS_PORT     || '5353');
const DNS_HOST     = process.env.DNS_HOST              || '0.0.0.0';
const DNS_SERVER_IP = process.env.DNS_SERVER_IP        || '34.117.33.233';
const DNSSEC_ENABLED = process.env.DNSSEC_ENABLED      === 'true';
const MAX_UDP_SIZE = 4096;
const DOH_UPSTREAM = process.env.DOH_UPSTREAM || 'https://cloudflare-dns.com/dns-query';

// ── Metrics ────────────────────────────────────────────────────────────────

let queryCount = 0;
let startTime  = Date.now();

export function getQueryCount():  number { return queryCount; }
export function getUptimeSeconds(): number { return (Date.now() - startTime) / 1000; }

// ── DoH upstream fallback ──────────────────────────────────────────────────

async function dohForward(rawQuery: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const url = new URL(DOH_UPSTREAM);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/dns-message',
        'Accept':         'application/dns-message',
        'Content-Length': rawQuery.length.toString(),
      },
    };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(rawQuery);
    req.end();
  });
}

// ── Query processing ───────────────────────────────────────────────────────

async function processQuery(rawQuery: Buffer, clientIp: string): Promise<Buffer> {
  queryCount++;

  let pkt: DnsPacket;
  try {
    pkt = parsePacket(rawQuery);
  } catch {
    return errorPacket(0, 1 /* FORMERR */);
  }

  const { id, rd } = pkt.header;

  // Only handle standard queries
  if (pkt.header.opcode !== OPCODE_QUERY) {
    return errorPacket(id, RCODE_NOTIMP, pkt.questions);
  }

  if (pkt.questions.length === 0) {
    return errorPacket(id, 1 /* FORMERR */, pkt.questions);
  }

  const q = pkt.questions[0];
  const qname = q.name.toLowerCase().replace(/\.$/, '');
  const qtype = q.type;

  // ── EDNS0 / DO bit ────────────────────────────────────────────────────────

  const optRR    = pkt.additional.find(rr => rr.type === TYPE.OPT);
  const edns     = optRR ? parseOPT(optRR) : null;
  const doBit    = edns?.dnssecOk ?? false;
  const udpSize  = edns?.udpSize  ?? 512;

  // Extract ECS client IP (or fall back to UDP source IP)
  let ecsInfo: { address: string; sourcePrefix: number; family: number } | null = null;
  if (edns) {
    for (const opt of edns.options) {
      if (opt.code === 8) { // ECS
        ecsInfo = parseECS(opt.data);
        break;
      }
    }
  }
  const effectiveClientIp = ecsInfo?.address || clientIp;

  // ── Non-authoritative → forward upstream ──────────────────────────────────

  if (!isAuthoritative(qname)) {
    if (!rd) return errorPacket(id, RCODE_REFUSED, pkt.questions);
    const resp = await dohForward(rawQuery);
    if (resp) return resp;
    return errorPacket(id, RCODE_SERVFAIL, pkt.questions);
  }

  // ── Authoritative lookup ──────────────────────────────────────────────────

  const zone     = getDomain();
  const zoneSalt = getZoneSalt(zone);

  let answers:    DnsRecord[] = [];
  let authority:  DnsRecord[] = [];
  let additional: DnsRecord[] = [];
  let rcode = RCODE_NOERROR;
  let aa    = 1;

  // ── Special types ──────────────────────────────────────────────────────────

  if (qtype === TYPE.DNSKEY) {
    answers = getDnskeyRecords(zone);
    if (answers.length === 0) rcode = RCODE_NOERROR; // empty OK
  } else if (qtype === TYPE.DS) {
    const ds = getDSRecord(zone);
    if (ds) answers = [ds];
  } else if (qtype === TYPE.NSEC3PARAM) {
    answers = [{
      name:  zone,
      type:  TYPE.NSEC3PARAM,
      class: CLASS_IN,
      ttl:   3600,
      rdata: buildNsec3ParamRdata(zoneSalt),
    }];
  } else {
    // ── Standard record lookup ───────────────────────────────────────────────

    const typeName = TYPE_NAME[qtype] || '';
    let recs = resolveRecords(qname, typeName);

    // GeoDNS: for A records, replace IP with geo-targeted value
    if (qtype === TYPE.A && recs.length > 0) {
      const geoIp = await resolveGeoIP(effectiveClientIp);
      if (geoIp !== DNS_SERVER_IP) {
        recs = recs.map(rr => ({ ...rr, rdata: rdataA(geoIp) }));
      }
    }

    if (recs.length > 0) {
      answers = recs;
    } else {
      // Try ANY fallback for AAAA and other non-A types
      if (qtype !== TYPE.A && qtype !== TYPE.NS) {
        const aRecs = resolveRecords(qname, 'A');
        if (aRecs.length === 0 && !isAuthoritative(qname)) {
          rcode = RCODE_NXDOMAIN;
        } else if (aRecs.length === 0) {
          rcode = RCODE_NOERROR; // NODATA — name exists but no records for type
        }
      } else if (qtype === TYPE.A || qtype === TYPE.NS) {
        // Check if name exists at all
        const soaRec = getSOA();
        rcode = RCODE_NXDOMAIN;
        if (soaRec) authority = [soaRec];
      }
    }
  }

  // ── NS + SOA in authority for positive answers ────────────────────────────

  if (rcode === RCODE_NOERROR && answers.length === 0 && qtype !== TYPE.DNSKEY) {
    const soa = getSOA();
    if (soa) authority = [soa]; // NODATA proof
  }

  if (rcode === RCODE_NOERROR && answers.length > 0 && qtype !== TYPE.DNSKEY && qtype !== TYPE.NS) {
    authority = getNS();
  }

  // ── DNSSEC signing ────────────────────────────────────────────────────────

  if (DNSSEC_ENABLED && isDnssecReady() && doBit) {
    if (answers.length > 0) {
      const rrsig = signRRset(answers, qtype);
      if (rrsig) answers.push(rrsig);
    }
    if (qtype === TYPE.DNSKEY && answers.length > 0) {
      const kskRrsig = signRRset(answers.filter(r => r.type === TYPE.DNSKEY), TYPE.DNSKEY);
      if (kskRrsig) answers.push(kskRrsig);
    }

    // NSEC3 proof of non-existence for NXDOMAIN
    if (rcode === RCODE_NXDOMAIN) {
      const allNames = [zone, `*.${zone}`];
      const hashes   = allNames.map(n => ({ name: n, hash: nsec3Hash(n, zoneSalt, NSEC3_ITERATIONS) }));
      hashes.sort((a, b) => a.hash.compare(b.hash));
      const queryHash = nsec3Hash(qname, zoneSalt, NSEC3_ITERATIONS);
      const nsec3Rr: DnsRecord = {
        name:  nsec3HashedOwner(zone, zone, zoneSalt),
        type:  TYPE.NSEC3,
        class: CLASS_IN,
        ttl:   300,
        rdata: buildNsec3Rdata(zoneSalt, hashes[0].hash, [TYPE.A, TYPE.NS, TYPE.SOA, TYPE.DNSKEY]),
      };
      authority.push(nsec3Rr);
    }
  }

  // ── ECS response option ───────────────────────────────────────────────────

  const additionalRrs: DnsRecord[] = [...additional];
  if (edns) {
    const respOptions: Array<{ code: number; data: Buffer }> = [];
    if (ecsInfo) {
      const geo   = await lookupGeo(ecsInfo.address);
      const scope = geo ? ecsInfo.sourcePrefix : 0;
      respOptions.push({
        code: 8,
        data: buildECSOption(ecsInfo.address, ecsInfo.sourcePrefix, scope, ecsInfo.family),
      });
    }
    additionalRrs.push(buildOPT(Math.min(udpSize, MAX_UDP_SIZE), doBit, respOptions));
  }

  // ── Encode response ───────────────────────────────────────────────────────

  const resp = encodePacket({
    id,
    aa,
    rd,
    rcode,
    questions:  pkt.questions,
    answers,
    authority,
    additional: additionalRrs,
  });

  // Truncation for UDP if over size limit
  const limit = edns ? Math.min(udpSize, MAX_UDP_SIZE) : 512;
  if (resp.length > limit) {
    // Return TC=1 so client retries over TCP
    return encodePacket({
      id,
      aa,
      rd,
      rcode: RCODE_NOERROR,
      questions: pkt.questions,
      answers: [],
      authority: [],
      additional: [],
    });
    // TODO: set TC bit in flags — for now return empty + let client use TCP
  }

  return resp;
}

// ── UDP Server ─────────────────────────────────────────────────────────────

function startUDP(): Promise<dgram.Socket> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');

    sock.on('error', (err) => {
      console.error(`[DNS/UDP] Error: ${err.message}`);
      reject(err);
    });

    sock.on('message', async (msg, rinfo) => {
      try {
        const resp = await processQuery(msg, rinfo.address);
        sock.send(resp, rinfo.port, rinfo.address);
      } catch (err: any) {
        console.error(`[DNS/UDP] processQuery error: ${err.message}`);
      }
    });

    sock.bind(DNS_PORT, DNS_HOST, () => {
      console.log(`[DNS/UDP] Listening on ${DNS_HOST}:${DNS_PORT}`);
      resolve(sock);
    });
  });
}

// ── TCP Server ─────────────────────────────────────────────────────────────

function startTCP(): net.Server {
  const server = net.createServer((socket) => {
    const clientIp = socket.remoteAddress?.replace('::ffff:', '') ?? '0.0.0.0';
    let rxBuf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
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
        }).catch((err: any) => {
          console.error(`[DNS/TCP] processQuery error: ${err.message}`);
          socket.destroy();
        });
      }
    });

    socket.on('error', () => socket.destroy());
    socket.setTimeout(30_000, () => socket.destroy());
  });

  server.listen(DNS_PORT, DNS_HOST, () => {
    console.log(`[DNS/TCP] Listening on ${DNS_HOST}:${DNS_PORT}`);
  });

  server.on('error', (err) => {
    console.error(`[DNS/TCP] Server error: ${err.message}`);
  });

  return server;
}

// ── Start ──────────────────────────────────────────────────────────────────

let udpSocket: dgram.Socket | null = null;
let tcpServer: net.Server   | null = null;

export async function startDnsServer(): Promise<void> {
  udpSocket = await startUDP();
  tcpServer  = startTCP();
}

export function stopDnsServer(): void {
  udpSocket?.close();
  tcpServer?.close();
}

export function isDnsRunning(): boolean {
  return udpSocket !== null;
}
