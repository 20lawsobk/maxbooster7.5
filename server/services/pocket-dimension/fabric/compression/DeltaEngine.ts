import { createHash } from 'crypto';
import type { DeltaOp } from './types.js';

const WINDOW = 32;
const MAX_MATCH = 4096;

export class DeltaEngine {
  encode(base: Buffer, target: Buffer): Buffer {
    const ops: DeltaOp[] = [];
    const index = this.buildIndex(base);

    let tPos = 0;
    let pendingInsert: number[] = [];

    const flushInsert = () => {
      if (pendingInsert.length > 0) {
        ops.push({ type: 'insert', length: pendingInsert.length, data: Buffer.from(pendingInsert) });
        pendingInsert = [];
      }
    };

    while (tPos < target.length) {
      if (tPos + WINDOW > target.length) {
        pendingInsert.push(target[tPos++]);
        continue;
      }

      const window = target.subarray(tPos, tPos + WINDOW);
      const key = this.hashWindow(window);
      const candidates = index.get(key) ?? [];

      let bestLen = 0;
      let bestSrc = -1;

      for (const srcPos of candidates) {
        const len = this.matchLength(base, srcPos, target, tPos, MAX_MATCH);
        if (len > bestLen) {
          bestLen = len;
          bestSrc = srcPos;
        }
      }

      if (bestLen >= WINDOW) {
        flushInsert();
        ops.push({ type: 'copy', srcOffset: bestSrc, length: bestLen });
        tPos += bestLen;
      } else {
        pendingInsert.push(target[tPos++]);
        if (pendingInsert.length >= 4096) flushInsert();
      }
    }

    flushInsert();
    return this.serializeOps(ops, base.length, target.length);
  }

  decode(base: Buffer, delta: Buffer): Buffer {
    const { baseLen, targetLen, ops } = this.deserializeOps(delta);
    const out = Buffer.allocUnsafe(targetLen);
    let outPos = 0;

    for (const op of ops) {
      if (op.type === 'copy' && op.srcOffset !== undefined) {
        base.copy(out, outPos, op.srcOffset, op.srcOffset + op.length);
        outPos += op.length;
      } else if (op.type === 'insert' && op.data) {
        op.data.copy(out, outPos);
        outPos += op.length;
      }
    }

    return out.subarray(0, outPos);
  }

  deltaRatio(base: Buffer, target: Buffer): number {
    const delta = this.encode(base, target);
    return target.length / delta.length;
  }

  private buildIndex(data: Buffer): Map<string, number[]> {
    const idx = new Map<string, number[]>();
    for (let i = 0; i + WINDOW <= data.length; i += Math.floor(WINDOW / 2)) {
      const key = this.hashWindow(data.subarray(i, i + WINDOW));
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(i);
    }
    return idx;
  }

  private hashWindow(data: Buffer): string {
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16);
  }

  private matchLength(a: Buffer, aPos: number, b: Buffer, bPos: number, max: number): number {
    let len = 0;
    while (len < max && aPos + len < a.length && bPos + len < b.length && a[aPos + len] === b[bPos + len]) {
      len++;
    }
    return len;
  }

  private serializeOps(ops: DeltaOp[], baseLen: number, targetLen: number): Buffer {
    const parts: Buffer[] = [];
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32LE(baseLen, 0);
    header.writeUInt32LE(targetLen, 4);
    parts.push(header);

    for (const op of ops) {
      if (op.type === 'copy') {
        const b = Buffer.allocUnsafe(9);
        b[0] = 0x01;
        b.writeUInt32LE(op.srcOffset!, 1);
        b.writeUInt32LE(op.length, 5);
        parts.push(b);
      } else {
        const b = Buffer.allocUnsafe(5 + op.length);
        b[0] = 0x02;
        b.writeUInt32LE(op.length, 1);
        op.data!.copy(b, 5);
        parts.push(b);
      }
    }

    return Buffer.concat(parts);
  }

  private deserializeOps(delta: Buffer): { baseLen: number; targetLen: number; ops: DeltaOp[] } {
    const baseLen = delta.readUInt32LE(0);
    const targetLen = delta.readUInt32LE(4);
    const ops: DeltaOp[] = [];
    let pos = 8;

    while (pos < delta.length) {
      const type = delta[pos++];
      if (type === 0x01) {
        const srcOffset = delta.readUInt32LE(pos); pos += 4;
        const length = delta.readUInt32LE(pos); pos += 4;
        ops.push({ type: 'copy', srcOffset, length });
      } else if (type === 0x02) {
        const length = delta.readUInt32LE(pos); pos += 4;
        const data = delta.subarray(pos, pos + length); pos += length;
        ops.push({ type: 'insert', length, data });
      }
    }

    return { baseLen, targetLen, ops };
  }
}

export const deltaEngine = new DeltaEngine();
