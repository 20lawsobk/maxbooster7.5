/**
 * GF(2^8) finite-field arithmetic for Reed–Solomon erasure coding.
 *
 * Uses the standard AES/Backblaze reducing polynomial 0x11d with generator 2.
 * All operations are byte-wise (0–255). Exp/log tables make multiply/divide
 * O(1); a doubled exp table avoids a modulo in the hot multiply path.
 */

const POLY = 0x11d;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initTables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= POLY;
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("GF(256) division by zero");
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a]! + 255 - GF_LOG[b]!) % 255]!;
}

export function gfInverse(a: number): number {
  if (a === 0) throw new Error("GF(256) inverse of zero");
  return GF_EXP[255 - GF_LOG[a]!]!;
}

/**
 * Multiply matrix `a` (rows×inner) by `b` (inner×cols) over GF(256).
 * Returns a fresh rows×cols matrix (number[][]).
 */
export function gfMatMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]!.length;
  const out: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array<number>(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      let acc = 0;
      for (let k = 0; k < inner; k++) {
        acc ^= gfMul(a[i]![k]!, b[k]![j]!);
      }
      row[j] = acc;
    }
    out.push(row);
  }
  return out;
}

/**
 * Invert a square matrix over GF(256) via Gauss–Jordan elimination.
 * Throws if the matrix is singular (should never happen for a Cauchy-derived
 * submatrix, which is always invertible).
 */
export function gfMatInvert(src: number[][]): number[][] {
  const n = src.length;
  const m = src.map((row) => row.slice());
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0);
    row[i] = 1;
    inv.push(row);
  }

  for (let col = 0; col < n; col++) {
    // Find a pivot row with a non-zero entry in this column.
    let pivot = col;
    while (pivot < n && m[pivot]![col] === 0) pivot++;
    if (pivot === n) throw new Error("Matrix is singular — cannot invert");

    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot]!, m[col]!];
      [inv[col], inv[pivot]] = [inv[pivot]!, inv[col]!];
    }

    // Scale pivot row so the pivot becomes 1.
    const pivVal = m[col]![col]!;
    const pivInv = gfInverse(pivVal);
    for (let j = 0; j < n; j++) {
      m[col]![j] = gfMul(m[col]![j]!, pivInv);
      inv[col]![j] = gfMul(inv[col]![j]!, pivInv);
    }

    // Eliminate the column from every other row.
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) {
        m[row]![j] ^= gfMul(factor, m[col]![j]!);
        inv[row]![j] ^= gfMul(factor, inv[col]![j]!);
      }
    }
  }

  return inv;
}
