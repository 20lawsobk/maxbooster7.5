import { logger } from '../logger';
export type NodeType = 'track' | 'bus' | 'aux' | 'master' | 'send' | 'return' | 'sidechain' | 'plugin';

export interface RoutingNode {
  id: string;
  type: NodeType;
  name: string;
  trackId?: string;
  pluginId?: string;
  latency: number;
  bypass: boolean;
  inputs: string[];
  outputs: string[];
}

export interface RoutingEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceChannel: number;
  targetChannel: number;
  gain: number;
  preFader: boolean;
  muted: boolean;
  type: 'audio' | 'midi' | 'sidechain' | 'control';
}

export interface RoutingPath {
  nodes: string[];
  totalLatency: number;
}

export interface RoutingGraphState {
  nodes: RoutingNode[];
  edges: RoutingEdge[];
  masterNodeId: string | null;
  outputNodeId: string | null;
  maxLatency: number;
  compensatedLatencies: Map<string, number>;
}

export class RoutingEngine {
  private state: RoutingGraphState;
  private listeners: Set<() => void> = new Set();
  private adjacencyList: Map<string, Set<string>> = new Map();

  constructor() {
    this.state = {
      nodes: [],
      edges: [],
      masterNodeId: null,
      outputNodeId: null,
      maxLatency: 0,
      compensatedLatencies: new Map(),
    };
  }

  getState(): Readonly<RoutingGraphState> {
    return { ...this.state };
  }

  addNode(node: Omit<RoutingNode, 'id' | 'inputs' | 'outputs'>): string {
    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNode: RoutingNode = {
      ...node,
      id,
      inputs: [],
      outputs: [],
    };

    this.state.nodes.push(newNode);
    this.adjacencyList.set(id, new Set());

    if (node.type === 'master' && !this.state.masterNodeId) {
      this.state.masterNodeId = id;
    }

    this.notify();
    return id;
  }

  removeNode(nodeId: string): void {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    this.state.edges = this.state.edges.filter(e => 
      e.sourceId !== nodeId && e.targetId !== nodeId
    );

    for (const [, targets] of this.adjacencyList) {
      targets.delete(nodeId);
    }
    this.adjacencyList.delete(nodeId);

    this.state.nodes = this.state.nodes.filter(n => n.id !== nodeId);

    if (this.state.masterNodeId === nodeId) {
      this.state.masterNodeId = null;
    }

    this.recalculateLatencies();
    this.notify();
  }

  connect(
    sourceId: string, 
    targetId: string, 
    options: Partial<Omit<RoutingEdge, 'id' | 'sourceId' | 'targetId'>> = {}
  ): string | null {
    const source = this.state.nodes.find(n => n.id === sourceId);
    const target = this.state.nodes.find(n => n.id === targetId);

    if (!source || !target) return null;

    if (this.wouldCreateCycle(sourceId, targetId)) {
      logger.warn('Cannot create connection: would create a cycle');
      return null;
    }

    const id = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const edge: RoutingEdge = {
      id,
      sourceId,
      targetId,
      sourceChannel: options.sourceChannel ?? 0,
      targetChannel: options.targetChannel ?? 0,
      gain: options.gain ?? 1,
      preFader: options.preFader ?? false,
      muted: options.muted ?? false,
      type: options.type ?? 'audio',
    };

    this.state.edges.push(edge);
    source.outputs.push(targetId);
    target.inputs.push(sourceId);

    if (!this.adjacencyList.has(sourceId)) {
      this.adjacencyList.set(sourceId, new Set());
    }
    this.adjacencyList.get(sourceId)!.add(targetId);

    this.recalculateLatencies();
    this.notify();
    return id;
  }

  disconnect(edgeId: string): void {
    const edge = this.state.edges.find(e => e.id === edgeId);
    if (!edge) return;

    const source = this.state.nodes.find(n => n.id === edge.sourceId);
    const target = this.state.nodes.find(n => n.id === edge.targetId);

    if (source) {
      source.outputs = source.outputs.filter(id => id !== edge.targetId);
    }
    if (target) {
      target.inputs = target.inputs.filter(id => id !== edge.sourceId);
    }

    this.adjacencyList.get(edge.sourceId)?.delete(edge.targetId);
    this.state.edges = this.state.edges.filter(e => e.id !== edgeId);

    this.recalculateLatencies();
    this.notify();
  }

  setEdgeGain(edgeId: string, gain: number): void {
    const edge = this.state.edges.find(e => e.id === edgeId);
    if (edge) {
      edge.gain = Math.max(0, Math.min(4, gain));
      this.notify();
    }
  }

  setEdgeMuted(edgeId: string, muted: boolean): void {
    const edge = this.state.edges.find(e => e.id === edgeId);
    if (edge) {
      edge.muted = muted;
      this.notify();
    }
  }

  setEdgePreFader(edgeId: string, preFader: boolean): void {
    const edge = this.state.edges.find(e => e.id === edgeId);
    if (edge) {
      edge.preFader = preFader;
      this.notify();
    }
  }

  setNodeLatency(nodeId: string, latency: number): void {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (node) {
      node.latency = Math.max(0, latency);
      this.recalculateLatencies();
      this.notify();
    }
  }

  setNodeBypass(nodeId: string, bypass: boolean): void {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (node) {
      node.bypass = bypass;
      this.recalculateLatencies();
      this.notify();
    }
  }

  createSend(sourceTrackId: string, targetBusId: string, gain: number = 1, preFader: boolean = false): string | null {
    const sendNodeId = this.addNode({
      type: 'send',
      name: `Send to ${targetBusId}`,
      trackId: sourceTrackId,
      latency: 0,
      bypass: false,
    });

    const edgeToSend = this.connect(sourceTrackId, sendNodeId, { gain: 1, preFader });
    const edgeToBus = this.connect(sendNodeId, targetBusId, { gain, preFader: true });

    if (!edgeToSend || !edgeToBus) {
      this.removeNode(sendNodeId);
      return null;
    }

    return sendNodeId;
  }

  createBus(name: string): string {
    return this.addNode({
      type: 'bus',
      name,
      latency: 0,
      bypass: false,
    });
  }

  createAux(name: string): string {
    return this.addNode({
      type: 'aux',
      name,
      latency: 0,
      bypass: false,
    });
  }

  createSidechainConnection(sourceId: string, targetPluginId: string): string | null {
    const sidechainNodeId = this.addNode({
      type: 'sidechain',
      name: `Sidechain from ${sourceId}`,
      pluginId: targetPluginId,
      latency: 0,
      bypass: false,
    });

    const edge = this.connect(sourceId, sidechainNodeId, { type: 'sidechain' });
    if (!edge) {
      this.removeNode(sidechainNodeId);
      return null;
    }

    return sidechainNodeId;
  }

  private wouldCreateCycle(sourceId: string, targetId: string): boolean {
    const visited = new Set<string>();
    const stack = [targetId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      
      if (current === sourceId) {
        return true;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          stack.push(neighbor);
        }
      }
    }

    return false;
  }

  private recalculateLatencies(): void {
    const latencies = new Map<string, number>();
    const visited = new Set<string>();
    const sorted: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.state.nodes.find(n => n.id === nodeId);
      if (!node) return;

      for (const inputId of node.inputs) {
        visit(inputId);
      }
      sorted.push(nodeId);
    };

    for (const node of this.state.nodes) {
      visit(node.id);
    }

    for (const nodeId of sorted) {
      const node = this.state.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      let maxInputLatency = 0;
      for (const inputId of node.inputs) {
        const inputLatency = latencies.get(inputId) ?? 0;
        maxInputLatency = Math.max(maxInputLatency, inputLatency);
      }

      const nodeLatency = node.bypass ? 0 : node.latency;
      latencies.set(nodeId, maxInputLatency + nodeLatency);
    }

    let maxLatency = 0;
    for (const [nodeId, latency] of latencies) {
      maxLatency = Math.max(maxLatency, latency);
    }

    this.state.maxLatency = maxLatency;
    this.state.compensatedLatencies = new Map();

    for (const [nodeId, latency] of latencies) {
      this.state.compensatedLatencies.set(nodeId, maxLatency - latency);
    }
  }

  getLatencyCompensation(nodeId: string): number {
    return this.state.compensatedLatencies.get(nodeId) ?? 0;
  }

  getTotalLatency(): number {
    return this.state.maxLatency;
  }

  findPath(sourceId: string, targetId: string): RoutingPath | null {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): boolean => {
      if (current === targetId) {
        path.push(current);
        return true;
      }

      if (visited.has(current)) return false;
      visited.add(current);

      const neighbors = this.adjacencyList.get(current);
      if (!neighbors) return false;

      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          path.unshift(current);
          return true;
        }
      }

      return false;
    };

    if (!dfs(sourceId)) return null;

    let totalLatency = 0;
    for (const nodeId of path) {
      const node = this.state.nodes.find(n => n.id === nodeId);
      if (node && !node.bypass) {
        totalLatency += node.latency;
      }
    }

    return { nodes: path, totalLatency };
  }

  getNodesOfType(type: NodeType): RoutingNode[] {
    return this.state.nodes.filter(n => n.type === type);
  }

  getConnectedNodes(nodeId: string, direction: 'inputs' | 'outputs'): RoutingNode[] {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node) return [];

    const ids = direction === 'inputs' ? node.inputs : node.outputs;
    return this.state.nodes.filter(n => ids.includes(n.id));
  }

  getEdgesForNode(nodeId: string): RoutingEdge[] {
    return this.state.edges.filter(e => e.sourceId === nodeId || e.targetId === nodeId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  serialize(): { nodes: RoutingNode[]; edges: RoutingEdge[] } {
    return {
      nodes: structuredClone(this.state.nodes),
      edges: structuredClone(this.state.edges),
    };
  }

  deserialize(data: { nodes: RoutingNode[]; edges: RoutingEdge[] }): void {
    this.state.nodes = structuredClone(data.nodes);
    this.state.edges = structuredClone(data.edges);

    this.adjacencyList.clear();
    for (const node of this.state.nodes) {
      this.adjacencyList.set(node.id, new Set());
      if (node.type === 'master') {
        this.state.masterNodeId = node.id;
      }
    }

    for (const edge of this.state.edges) {
      this.adjacencyList.get(edge.sourceId)?.add(edge.targetId);
    }

    this.recalculateLatencies();
    this.notify();
  }
}

export const routingEngine = new RoutingEngine();
