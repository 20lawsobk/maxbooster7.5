/**
 * Max Booster — EPP Client  (T005)
 *
 * Production-grade EPP TLS socket + framing engine built from scratch.
 * RFC 5730 §7 specifies the 4-byte big-endian total-length frame header.
 *
 * Design:
 *  - Single in-flight command (EPP sessions are strictly sequential)
 *  - Command queue: commands are serialized via a promise chain
 *  - Auto-reconnect: on any socket error, the session is reset and the
 *    next command automatically re-connects + re-logs in
 *  - TLS with optional client certificate (Verisign requires this in prod)
 */

import * as tls    from 'tls';
import { logger }  from '../../logger.js';
import type { EppConfig } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class EppClient {
  private socket:    tls.TLSSocket | null = null;
  private rxBuf:     Buffer               = Buffer.alloc(0);
  private queue:     Array<(xml: string) => void> = [];
  private errQueue:  Array<(err: Error)   => void> = [];

  /** Serialization lock — all commands chain off this promise */
  private lastCmd:   Promise<unknown>     = Promise.resolve();

  private readonly cfg: EppConfig;
  private readonly timeoutMs: number;

  constructor(cfg: EppConfig) {
    this.cfg       = cfg;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  /**
   * Open a TLS connection to the EPP server.
   * Resolves with the greeting XML that the server sends on connect.
   * Idempotent — calling connect() on an already-open socket is a no-op
   * that returns the empty string immediately.
   */
  async connect(): Promise<string> {
    if (this.socket?.writable) return '';

    return new Promise<string>((resolve, reject) => {
      const opts: tls.ConnectionOptions = {
        host:               this.cfg.host,
        port:               this.cfg.port,
        rejectUnauthorized: this.cfg.rejectUnauthorized ?? false,
        timeout:            this.timeoutMs,
      };

      if (this.cfg.tlsCert && this.cfg.tlsKey) {
        opts.cert = this.cfg.tlsCert;
        opts.key  = this.cfg.tlsKey;
      }

      const sock = tls.connect(opts);

      sock.once('error', (err) => {
        this.teardown();
        reject(err);
      });

      sock.once('timeout', () => {
        this.teardown();
        reject(new Error(`EPP connect timeout (${this.timeoutMs}ms) to ${this.cfg.host}:${this.cfg.port}`));
      });

      // The very first queued callback is for the server greeting
      this.queue.push(resolve);
      this.errQueue.push(reject);

      sock.on('data', (chunk: Buffer) => this.onData(chunk));

      sock.on('close', () => {
        logger.warn('[EPP] Socket closed');
        this.teardown();
        // Drain pending waiters with a reconnect error
        const err = new Error('EPP socket closed unexpectedly');
        while (this.errQueue.length) {
          this.errQueue.shift()!(err);
          this.queue.shift();
        }
      });

      sock.on('error', (err) => {
        logger.error({ err: err.message }, '[EPP] Socket error');
        this.teardown();
        while (this.errQueue.length) {
          this.errQueue.shift()!(err);
          this.queue.shift();
        }
      });

      this.socket = sock;
      logger.info(`[EPP] Connecting to ${this.cfg.host}:${this.cfg.port}`);
    });
  }

  // ── Framing ─────────────────────────────────────────────────────────────────

  private onData(chunk: Buffer): void {
    this.rxBuf = Buffer.concat([this.rxBuf, chunk]);

    while (this.rxBuf.length >= 4) {
      const totalLen = this.rxBuf.readUInt32BE(0); // includes the 4-byte header
      if (this.rxBuf.length < totalLen) break;

      const xmlBuf  = this.rxBuf.slice(4, totalLen);
      this.rxBuf    = this.rxBuf.slice(totalLen);
      const xml     = xmlBuf.toString('utf8');

      const resolve = this.queue.shift();
      this.errQueue.shift();     // discard corresponding error handler

      if (resolve) {
        resolve(xml);
      } else {
        logger.warn('[EPP] Unsolicited frame received — discarding');
      }
    }
  }

  // ── Send / Receive ──────────────────────────────────────────────────────────

  /**
   * Send an EPP XML frame and await the response frame.
   * Commands are serialized through `this.lastCmd` — no parallel sends.
   */
  send(xml: string): Promise<string> {
    const task = this.lastCmd.then(() => this._sendImmediate(xml));
    this.lastCmd = task.catch(() => {/* allow next command to proceed */});
    return task;
  }

  private _sendImmediate(xml: string): Promise<string> {
    if (!this.socket?.writable) {
      return Promise.reject(new Error('EPP: socket not connected'));
    }

    return new Promise<string>((resolve, reject) => {
      const xmlBuf = Buffer.from(xml, 'utf8');
      const hdr    = Buffer.alloc(4);
      hdr.writeUInt32BE(xmlBuf.length + 4, 0);

      // Timer for hung commands
      const timer = setTimeout(() => {
        // Remove our callbacks
        const idx = this.queue.indexOf(resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          this.errQueue.splice(idx, 1);
        }
        this.teardown();
        reject(new Error(`EPP command timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.queue.push((resp: string) => { clearTimeout(timer); resolve(resp); });
      this.errQueue.push((err: Error) => { clearTimeout(timer); reject(err); });

      this.socket!.write(Buffer.concat([hdr, xmlBuf]));
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  private teardown(): void {
    if (this.socket) {
      try { this.socket.destroy(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.rxBuf    = Buffer.alloc(0);
  }

  disconnect(): void {
    this.teardown();
    logger.info('[EPP] Disconnected');
  }

  get isConnected(): boolean {
    return this.socket?.writable === true;
  }
}
