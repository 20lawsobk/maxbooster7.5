import * as tls from 'tls';
import { logger } from '../../logger.js';
import { EppConfig, EppResponse } from './types.js';
import { EppParser } from './EppParser.js';

export class EppClient {
  private socket: tls.TLSSocket | null = null;
  private config: EppConfig;
  private buffer: Buffer = Buffer.alloc(0);
  private responseQueue: ((xml: string) => void)[] = [];
  private connectionPromise: Promise<void> | null = null;

  constructor(config: EppConfig) {
    this.config = config;
  }

  async connect(): Promise<string> {
    if (this.connectionPromise) return this.connectionPromise.then(() => ""); // Simplified

    this.connectionPromise = new Promise((resolve, reject) => {
      const options: tls.ConnectionOptions = {
        host: this.config.host,
        port: this.config.port,
        rejectUnauthorized: false, // In production, we might want to verify
      };

      if (this.config.tlsCert && this.config.tlsKey) {
        options.cert = this.config.tlsCert;
        options.key = this.config.tlsKey;
      }

      this.socket = tls.connect(options, () => {
        logger.info(`EPP Client connected to ${this.config.host}:${this.config.port}`);
      });

      this.socket.on('data', (data) => this.handleData(data));
      this.socket.on('error', (err) => {
        logger.error('EPP Socket error:', err);
        reject(err);
      });
      this.socket.on('close', () => {
        logger.warn('EPP Socket closed');
        this.socket = null;
        this.connectionPromise = null;
      });

      // The first message from EPP server is the greeting
      this.responseQueue.push((xml) => {
        resolve(xml);
      });
    });

    return this.connectionPromise.then(() => ""); // Actual return is handled via responseQueue push above but we need to satisfy type or change flow
  }

  // Adjusted connect to return greeting
  async connectAndGetGreeting(): Promise<string> {
      return new Promise((resolve, reject) => {
          const options: tls.ConnectionOptions = {
              host: this.config.host,
              port: this.config.port,
              rejectUnauthorized: false,
          };
          if (this.config.tlsCert && this.config.tlsKey) {
              options.cert = this.config.tlsCert;
              options.key = this.config.tlsKey;
          }

          this.socket = tls.connect(options, () => {
              logger.info(`EPP Client connected to ${this.config.host}:${this.config.port}`);
          });

          this.socket.on('data', (data) => this.handleData(data));
          this.socket.on('error', (err) => {
              logger.error('EPP Socket error:', err);
              reject(err);
          });

          this.responseQueue.push((xml) => {
              resolve(xml);
          });
      });
  }

  private handleData(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length >= length) {
        const xml = this.buffer.slice(4, length).toString('utf8');
        this.buffer = this.buffer.slice(length);
        
        const resolve = this.responseQueue.shift();
        if (resolve) {
          resolve(xml);
        }
      } else {
        break;
      }
    }
  }

  async send(xml: string): Promise<string> {
    if (!this.socket) {
        throw new Error("EPP Client not connected");
    }

    return new Promise((resolve) => {
      this.responseQueue.push(resolve);
      
      const xmlBuffer = Buffer.from(xml, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(xmlBuffer.length + 4, 0);
      
      this.socket!.write(lengthBuffer);
      this.socket!.write(xmlBuffer);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
