/**
 * Systematic Reed–Solomon erasure coding over GF(2^8).
 *
 * Splits a payload into `k` equal data shards and computes `m` parity shards.
 * Any `k` of the `k + m` shards are sufficient to reconstruct the original
 * data — i.e. the fabric tolerates up to `m` lost shards (nodes) per stripe.
 *
 * The coding matrix is `[ I_k ; C ]` where `C` is a Cauchy matrix. Every
 * square submatrix of a Cauchy matrix is invertible, so any `k` surviving
 * rows form an invertible system — decoding never fails for ≥ k shards.
 */

import { gfMul, gfInverse, gfMatInvert } from "./galois.js";

export interface EncodeResult {
  /** All shards: indices [0, k) are data, [k, k+m) are parity. */
  shards: Buffer[];
  shardSize: number;
}

export class ReedSolomon {
  /** Full (k+m) × k systematic coding matrix. */
  private readonly matrix: number[][];

  constructor(
    public readonly k: number,
    public readonly m: number,
  ) {
    if (k <= 0 || m < 0) throw new Error("Reed–Solomon requires k > 0, m >= 0");
    if (k + m > 256)
      throw new Error("Reed–Solomon over GF(256) requires k + m <= 256");
    this.matrix = this.buildMatrix(k, m);
  }

  /** `[ I_k ; Cauchy(m × k) ]`. */
  private buildMatrix(k: number, m: number): number[][] {
    const rows: number[][] = [];
    for (let i = 0; i < k; i++) {
      const row = new Array<number>(k).fill(0);
      row[i] = 1;
      rows.push(row);
    }
    // Cauchy element (i,j) = 1 / (x_i XOR y_j); x_i = k+i, y_j = j → all distinct.
    for (let i = 0; i < m; i++) {
      const x = k + i;
      const row = new Array<number>(k).fill(0);
      for (let j = 0; j < k; j++) {
        row[j] = gfInverse(x ^ j);
      }
      rows.push(row);
    }
    return rows;
  }

  /**
   * Encode a payload into k data + m parity shards.
   * The payload is zero-padded so its length is a multiple of k.
   *
   * Async: parity computation is O(shardSize × k) per parity row, which for
   * 4 MB chunks takes tens of ms — the loop yields to the event loop between
   * parity rows so bulk ingestion can never freeze the server.
   */
  async encode(payload: Buffer): Promise<EncodeResult> {
    const shardSize = Math.ceil(payload.length / this.k) || 1;
    const padded = Buffer.alloc(shardSize * this.k);
    payload.copy(padded);

    const data: Buffer[] = [];
    for (let i = 0; i < this.k; i++) {
      data.push(padded.subarray(i * shardSize, (i + 1) * shardSize));
    }

    const parity: Buffer[] = [];
    for (let p = 0; p < this.m; p++) {
      const coeffs = this.matrix[this.k + p]!;
      const out = Buffer.alloc(shardSize);
      for (let j = 0; j < this.k; j++) {
        const c = coeffs[j]!;
        if (c === 0) continue;
        const src = data[j]!;
        for (let b = 0; b < shardSize; b++) {
          out[b] ^= gfMul(c, src[b]!);
        }
      }
      parity.push(out);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    return { shards: [...data, ...parity], shardSize };
  }

  /**
   * Reconstruct the k data shards from any ≥ k surviving shards.
   * `shards` has length k+m; missing shards are `null`.
   * Returns the k data shards in order.
   *
   * Async: yields to the event loop between output rows (see encode).
   */
  async reconstructData(shards: (Buffer | null)[]): Promise<Buffer[]> {
    if (shards.length !== this.k + this.m) {
      throw new Error(
        `Expected ${this.k + this.m} shard slots, got ${shards.length}`,
      );
    }

    // Fast path: all data shards present.
    if (shards.slice(0, this.k).every((s) => s !== null)) {
      return shards.slice(0, this.k) as Buffer[];
    }

    // Collect the first k surviving shards and their matrix rows.
    const presentRows: number[][] = [];
    const presentData: Buffer[] = [];
    const presentIdx: number[] = [];
    for (let i = 0; i < shards.length && presentRows.length < this.k; i++) {
      const s = shards[i];
      if (s) {
        presentRows.push(this.matrix[i]!);
        presentData.push(s);
        presentIdx.push(i);
      }
    }
    if (presentRows.length < this.k) {
      throw new Error(
        `Reed–Solomon: only ${presentRows.length} shards available, need ${this.k}`,
      );
    }

    const shardSize = presentData[0]!.length;
    const inverse = gfMatInvert(presentRows);

    // data = inverse * presentData (matrix × shard-vectors, per byte).
    const data: Buffer[] = [];
    for (let i = 0; i < this.k; i++) {
      const coeffs = inverse[i]!;
      const out = Buffer.alloc(shardSize);
      for (let j = 0; j < this.k; j++) {
        const c = coeffs[j]!;
        if (c === 0) continue;
        const src = presentData[j]!;
        for (let b = 0; b < shardSize; b++) {
          out[b] ^= gfMul(c, src[b]!);
        }
      }
      data.push(out);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return data;
  }
}
