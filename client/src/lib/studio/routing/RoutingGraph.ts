export interface RoutingNode {
  id: string;
  type: 'track' | 'bus' | 'aux' | 'master' | 'external' | 'plugin';
  name: string;
  inputCount: number;
  outputCount: number;
  latencySamples: number;
}

export interface RoutingEdge {
  id: string;
  sourceId: string;
  sourceOutput: number;
  targetId: string;
  targetInput: number;
  gain: number;
  preFader: boolean;
  muted: boolean;
  latencySamples: number;
}

export interface RoutingPath {
  nodes: string[];
  totalLatencySamples: number;
}

export class RoutingGraph {
  private nodes: Map<string, RoutingNode> = new Map();
  private edges: Map<string, RoutingEdge> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private reverseAdjacencyList: Map<string, Set<string>> = new Map();
  private cachedLatencies: Map<string, number> = new Map();
  private isDirty: boolean = true;
  
  addNode(node: RoutingNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, new Set());
    }
    if (!this.reverseAdjacencyList.has(node.id)) {
      this.reverseAdjacencyList.set(node.id, new Set());
    }
    this.isDirty = true;
  }
  
  removeNode(nodeId: string): void {
    const toRemove: string[] = [];
    this.edges.forEach((edge, edgeId) => {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        toRemove.push(edgeId);
      }
    });
    toRemove.forEach(edgeId => this.removeEdge(edgeId));
    
    this.nodes.delete(nodeId);
    this.adjacencyList.delete(nodeId);
    this.reverseAdjacencyList.delete(nodeId);
    this.isDirty = true;
  }
  
  getNode(nodeId: string): RoutingNode | undefined {
    return this.nodes.get(nodeId);
  }
  
  getAllNodes(): RoutingNode[] {
    return Array.from(this.nodes.values());
  }
  
  addEdge(edge: RoutingEdge): void {
    if (this.wouldCreateCycle(edge.sourceId, edge.targetId)) {
      throw new Error('Adding this connection would create a feedback loop');
    }
    
    this.edges.set(edge.id, edge);
    
    const sources = this.adjacencyList.get(edge.sourceId);
    if (sources) {
      sources.add(edge.targetId);
    }
    
    const targets = this.reverseAdjacencyList.get(edge.targetId);
    if (targets) {
      targets.add(edge.sourceId);
    }
    
    this.isDirty = true;
  }
  
  removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    
    const sources = this.adjacencyList.get(edge.sourceId);
    if (sources) {
      sources.delete(edge.targetId);
    }
    
    const targets = this.reverseAdjacencyList.get(edge.targetId);
    if (targets) {
      targets.delete(edge.sourceId);
    }
    
    this.edges.delete(edgeId);
    this.isDirty = true;
  }
  
  getEdge(edgeId: string): RoutingEdge | undefined {
    return this.edges.get(edgeId);
  }
  
  getAllEdges(): RoutingEdge[] {
    return Array.from(this.edges.values());
  }
  
  getEdgesFromNode(nodeId: string): RoutingEdge[] {
    return Array.from(this.edges.values()).filter(e => e.sourceId === nodeId);
  }
  
  getEdgesToNode(nodeId: string): RoutingEdge[] {
    return Array.from(this.edges.values()).filter(e => e.targetId === nodeId);
  }
  
  getDownstreamNodes(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];
    const result: string[] = [];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            result.push(neighbor);
            queue.push(neighbor);
          }
        });
      }
    }
    
    return result;
  }
  
  getUpstreamNodes(nodeId: string): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];
    const result: string[] = [];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.reverseAdjacencyList.get(current);
      if (neighbors) {
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            result.push(neighbor);
            queue.push(neighbor);
          }
        });
      }
    }
    
    return result;
  }
  
  wouldCreateCycle(sourceId: string, targetId: string): boolean {
    if (sourceId === targetId) return true;
    const downstream = this.getDownstreamNodes(targetId);
    return downstream.includes(sourceId);
  }
  
  getTopologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    this.nodes.forEach((_, nodeId) => {
      inDegree.set(nodeId, 0);
    });
    
    this.edges.forEach(edge => {
      const current = inDegree.get(edge.targetId) || 0;
      inDegree.set(edge.targetId, current + 1);
    });
    
    const queue: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });
    
    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        neighbors.forEach(neighbor => {
          const degree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, degree);
          if (degree === 0) {
            queue.push(neighbor);
          }
        });
      }
    }
    
    return result;
  }
  
  calculateLatencyCompensation(): Map<string, number> {
    if (!this.isDirty && this.cachedLatencies.size > 0) {
      return this.cachedLatencies;
    }
    
    const order = this.getTopologicalOrder();
    const latencies = new Map<string, number>();
    let maxLatency = 0;
    
    order.forEach(nodeId => latencies.set(nodeId, 0));
    
    for (let i = order.length - 1; i >= 0; i--) {
      const nodeId = order[i];
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      
      const outgoingEdges = this.getEdgesFromNode(nodeId);
      let maxDownstreamLatency = 0;
      
      for (const edge of outgoingEdges) {
        const neighborLatency = latencies.get(edge.targetId) || 0;
        const neighborNode = this.nodes.get(edge.targetId);
        const edgeLatency = edge.latencySamples || 0;
        const totalLatency = neighborLatency + (neighborNode?.latencySamples || 0) + edgeLatency;
        maxDownstreamLatency = Math.max(maxDownstreamLatency, totalLatency);
      }
      
      latencies.set(nodeId, maxDownstreamLatency);
      maxLatency = Math.max(maxLatency, node.latencySamples + maxDownstreamLatency);
    }
    
    const compensation = new Map<string, number>();
    latencies.forEach((latency, nodeId) => {
      const node = this.nodes.get(nodeId);
      compensation.set(nodeId, maxLatency - latency - (node?.latencySamples || 0));
    });
    
    this.cachedLatencies = compensation;
    this.isDirty = false;
    
    return compensation;
  }
  
  getProcessingOrder(): string[] {
    return this.getTopologicalOrder();
  }
  
  createSend(sourceId: string, targetId: string, preFader: boolean = false, gain: number = 0): RoutingEdge {
    const edge: RoutingEdge = {
      id: `send-${sourceId}-${targetId}-${Date.now()}`,
      sourceId,
      sourceOutput: 0,
      targetId,
      targetInput: 0,
      gain,
      preFader,
      muted: false,
      latencySamples: 0,
    };
    this.addEdge(edge);
    return edge;
  }
  
  setEdgeLatency(edgeId: string, latencySamples: number): void {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.latencySamples = latencySamples;
      this.isDirty = true;
    }
  }
  
  getSendsFromTrack(trackId: string): RoutingEdge[] {
    return this.getEdgesFromNode(trackId).filter(e => {
      const target = this.nodes.get(e.targetId);
      return target && (target.type === 'bus' || target.type === 'aux');
    });
  }
  
  setNodeLatency(nodeId: string, latencySamples: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.latencySamples = latencySamples;
      this.isDirty = true;
    }
  }
  
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.cachedLatencies.clear();
    this.isDirty = true;
  }
  
  serialize(): { nodes: RoutingNode[]; edges: RoutingEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }
  
  deserialize(data: { nodes: RoutingNode[]; edges: RoutingEdge[] }): void {
    this.clear();
    data.nodes.forEach(node => this.addNode(node));
    data.edges.forEach(edge => {
      try {
        this.addEdge(edge);
      } catch (e) {
        console.warn('Skipping edge that would create cycle:', edge);
      }
    });
  }
}

export const routingGraph = new RoutingGraph();
