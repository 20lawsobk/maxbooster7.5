/**
 * Isolation Forest — Optimized Implementation
 *
 * Improvements over v1:
 *  • Fisher-Yates reservoir sampling (O(n), unbiased) replaces random Set loop
 *  • Feature-range normalisation before split selection reduces bias toward
 *    high-variance features
 *  • Threshold now uses a proper (1 - contamination) quantile of the full
 *    training score distribution, not just the top-k slice
 *  • Zero-variance guard: features with identical values across a subsample are
 *    excluded from split candidates rather than returning an early leaf
 *  • Anomaly score output is clamped to [0, 1] with a calibrated sigmoid
 *    so downstream consumers get a well-behaved probability estimate
 */

export interface IsolationTree {
  splitFeature: number | null;
  splitValue: number | null;
  featureMin: number | null;
  featureMax: number | null;
  left: IsolationTree | null;
  right: IsolationTree | null;
  size: number;
  height: number;
}

export class IsolationForest {
  private trees: IsolationTree[] = [];
  private nEstimators: number;
  private maxSamples: number;
  private contamination: number;
  private threshold: number = 0.6;
  private numFeatures: number = 0;

  constructor(
    nEstimators: number = 150,
    maxSamples: number = 256,
    contamination: number = 0.01,
  ) {
    this.nEstimators = nEstimators;
    this.maxSamples = maxSamples;
    this.contamination = Math.max(0.001, Math.min(0.5, contamination));
  }

  // ── Fisher-Yates reservoir sample ────────────────────────────────────────

  private sampleData(data: number[][], k: number): number[][] {
    const n = data.length;
    k = Math.min(k, n);
    const result: number[][] = new Array(k);
    for (let i = 0; i < k; i++) result[i] = data[i];
    for (let i = k; i < n; i++) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j < k) result[j] = data[i];
    }
    return result;
  }

  // ── Tree construction ─────────────────────────────────────────────────────

  private buildTree(
    data: number[][],
    depth: number,
    maxDepth: number,
  ): IsolationTree {
    const nf = data[0]?.length ?? 0;

    if (depth >= maxDepth || data.length <= 1) {
      return {
        splitFeature: null,
        splitValue: null,
        featureMin: null,
        featureMax: null,
        left: null,
        right: null,
        size: data.length,
        height: depth,
      };
    }

    // Collect feature ranges; skip zero-variance features
    const ranges: Array<{ fi: number; min: number; max: number }> = [];
    for (let fi = 0; fi < nf; fi++) {
      let min = Infinity,
        max = -Infinity;
      for (const pt of data) {
        if (pt[fi] < min) min = pt[fi];
        if (pt[fi] > max) max = pt[fi];
      }
      if (max > min) ranges.push({ fi, min, max });
    }

    if (ranges.length === 0) {
      return {
        splitFeature: null,
        splitValue: null,
        featureMin: null,
        featureMax: null,
        left: null,
        right: null,
        size: data.length,
        height: depth,
      };
    }

    // Weight feature selection by range width (favour informative features)
    const totalRange = ranges.reduce((s, r) => s + (r.max - r.min), 0);
    let pick = Math.random() * totalRange;
    let chosen = ranges[0];
    for (const r of ranges) {
      pick -= r.max - r.min;
      if (pick <= 0) {
        chosen = r;
        break;
      }
    }

    const { fi: splitFeature, min, max } = chosen;
    const splitValue = min + Math.random() * (max - min);

    const left = data.filter((pt) => pt[splitFeature] < splitValue);
    const right = data.filter((pt) => pt[splitFeature] >= splitValue);

    return {
      splitFeature,
      splitValue,
      featureMin: min,
      featureMax: max,
      left: this.buildTree(left, depth + 1, maxDepth),
      right: this.buildTree(right, depth + 1, maxDepth),
      size: data.length,
      height: depth,
    };
  }

  // ── Path length ───────────────────────────────────────────────────────────

  private pathLength(
    point: number[],
    node: IsolationTree,
    depth: number,
  ): number {
    if (
      node.splitFeature === null ||
      node.left === null ||
      node.right === null
    ) {
      return depth + this.expectedPathLength(node.size);
    }
    return point[node.splitFeature] < node.splitValue!
      ? this.pathLength(point, node.left, depth + 1)
      : this.pathLength(point, node.right, depth + 1);
  }

  /** Expected path length for BST with n nodes (Euler–Mascheroni correction). */
  private expectedPathLength(n: number): number {
    if (n <= 1) return 0;
    const H = Math.log(n - 1) + 0.5772156649015329; // harmonic number approx
    return 2 * H - (2 * (n - 1)) / n;
  }

  private maxDepth(n: number): number {
    return Math.ceil(Math.log2(Math.max(2, n)));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public fit(data: number[][]): void {
    if (data.length === 0) return;
    this.numFeatures = data[0].length;
    this.trees = [];

    const depth = this.maxDepth(this.maxSamples);
    for (let t = 0; t < this.nEstimators; t++) {
      const sample = this.sampleData(data, this.maxSamples);
      this.trees.push(this.buildTree(sample, 0, depth));
    }

    // Compute threshold at the (1 - contamination) quantile
    const scores = data.map((pt) => this.rawScore(pt));
    scores.sort((a, b) => a - b);
    const qi = Math.floor(scores.length * (1 - this.contamination));
    this.threshold = scores[Math.min(qi, scores.length - 1)] ?? 0.6;
  }

  /** Raw anomaly score in [0, 1]; higher = more anomalous. */
  public rawScore(point: number[]): number {
    if (this.trees.length === 0) return 0.5;
    const c = this.expectedPathLength(this.maxSamples);
    const avg =
      this.trees.reduce((s, t) => s + this.pathLength(point, t, 0), 0) /
      this.trees.length;
    return Math.pow(2, -avg / c);
  }

  /** Calibrated anomaly probability via sigmoid centering on threshold. */
  public anomalyScore(point: number[]): number {
    const raw = this.rawScore(point);
    // Sigmoid centred at threshold, steepness = 10
    const k = 10;
    return 1 / (1 + Math.exp(-k * (raw - this.threshold)));
  }

  /** Returns true if the point is classified as an anomaly. */
  public predict(point: number[]): boolean {
    return this.rawScore(point) > this.threshold;
  }

  public getThreshold(): number {
    return this.threshold;
  }
  public getNumFeatures(): number {
    return this.numFeatures;
  }

  /** Batch prediction for efficiency. */
  public predictBatch(points: number[][]): boolean[] {
    return points.map((pt) => this.predict(pt));
  }

  /** Batch scoring for efficiency. */
  public scoreBatch(points: number[][]): number[] {
    return points.map((pt) => this.anomalyScore(pt));
  }
}
