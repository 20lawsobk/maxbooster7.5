/**
 * Custom Isolation Forest Implementation
 * Statistical anomaly detection using isolation trees
 * O(n log n) complexity for efficient anomaly detection
 */

export interface IsolationTree {
  splitFeature: number | null;
  splitValue: number | null;
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
  private threshold: number = 0;

  constructor(
    nEstimators: number = 100,
    maxSamples: number = 256,
    contamination: number = 0.01
  ) {
    this.nEstimators = nEstimators;
    this.maxSamples = maxSamples;
    this.contamination = contamination;
  }

  public fit(data: number[][]): void {
    this.trees = [];

    for (let i = 0; i < this.nEstimators; i++) {
      const sample = this.sampleData(data, this.maxSamples);
      const tree = this.buildTree(sample, 0, this.maxHeight(this.maxSamples));
      this.trees.push(tree);
    }

    const scores = data.map(point => this.anomalyScore(point));
    scores.sort((a, b) => b - a);
    const thresholdIndex = Math.floor(scores.length * this.contamination);
    this.threshold = scores[thresholdIndex] || 0.5;
  }

  public predict(point: number[]): boolean {
    const score = this.anomalyScore(point);
    return score > this.threshold;
  }

  public anomalyScore(point: number[]): number {
    if (this.trees.length === 0) {
      throw new Error('Model not fitted. Call fit() first.');
    }

    const avgPathLength =
      this.trees.reduce((sum, tree) => sum + this.pathLength(point, tree, 0), 0) /
      this.trees.length;

    const c = this.avgPathLength(this.maxSamples);
    const score = Math.pow(2, -avgPathLength / c);

    return score;
  }

  private buildTree(data: number[][], currentHeight: number, maxHeight: number): IsolationTree {
    if (currentHeight >= maxHeight || data.length <= 1) {
      return {
        splitFeature: null,
        splitValue: null,
        left: null,
        right: null,
        size: data.length,
        height: currentHeight,
      };
    }

    const numFeatures = data[0].length;
    const splitFeature = Math.floor(Math.random() * numFeatures);

    const featureValues = data.map(point => point[splitFeature]);
    const minVal = Math.min(...featureValues);
    const maxVal = Math.max(...featureValues);

    if (minVal === maxVal) {
      return {
        splitFeature: null,
        splitValue: null,
        left: null,
        right: null,
        size: data.length,
        height: currentHeight,
      };
    }

    const splitValue = minVal + Math.random() * (maxVal - minVal);

    const leftData = data.filter(point => point[splitFeature] < splitValue);
    const rightData = data.filter(point => point[splitFeature] >= splitValue);

    return {
      splitFeature,
      splitValue,
      left: this.buildTree(leftData, currentHeight + 1, maxHeight),
      right: this.buildTree(rightData, currentHeight + 1, maxHeight),
      size: data.length,
      height: currentHeight,
    };
  }

  private pathLength(point: number[], tree: IsolationTree, currentHeight: number): number {
    if (tree.splitFeature === null || tree.left === null || tree.right === null) {
      return currentHeight + this.avgPathLength(tree.size);
    }

    if (point[tree.splitFeature] < tree.splitValue!) {
      return this.pathLength(point, tree.left, currentHeight + 1);
    } else {
      return this.pathLength(point, tree.right, currentHeight + 1);
    }
  }

  private avgPathLength(n: number): number {
    if (n <= 1) return 0;
    const H = Math.log(n - 1) + 0.5772156649;
    return 2 * H - (2 * (n - 1)) / n;
  }

  private maxHeight(n: number): number {
    return Math.ceil(Math.log2(n));
  }

  private sampleData(data: number[][], sampleSize: number): number[][] {
    const n = Math.min(sampleSize, data.length);
    const indices = new Set<number>();

    while (indices.size < n) {
      indices.add(Math.floor(Math.random() * data.length));
    }

    return Array.from(indices).map(i => data[i]);
  }

  public getThreshold(): number {
    return this.threshold;
  }
}
