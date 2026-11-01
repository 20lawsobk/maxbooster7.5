// ============================================================================
// IPC Message Types — Worker ↔ Primary communication
// Workers forward all store/manager operations to the primary via process.send()
// Primary responds with results so each worker never holds its own Redis state.
// ============================================================================

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export type W2PMessage =
  // Redis / store operations
  | { kind: "validateToken"; reqId: string; instanceId: string; token: string }
  | { kind: "createInstance"; reqId: string; name: string; maxKeys: number }
  | { kind: "listInstances"; reqId: string }
  | { kind: "getInfo"; reqId: string; instanceId: string }
  | { kind: "deleteInstance"; reqId: string; instanceId: string }
  | {
      kind: "exec";
      reqId: string;
      instanceId: string;
      cmd: string;
      args: string[];
    }
  | {
      kind: "pipeline";
      reqId: string;
      instanceId: string;
      commands: Array<{ cmd: string; args: string[] }>;
    }
  | { kind: "touchInstance"; reqId: string; instanceId: string }
  // Monitor / diagnostic operations (primary-side state)
  | { kind: "getHealthSnapshot"; reqId: string }
  | { kind: "getHealthHistory"; reqId: string; limit: number }
  | { kind: "forceProbe"; reqId: string }
  | { kind: "getScaleStats"; reqId: string }
  | { kind: "evict"; reqId: string; count: number }
  | { kind: "compact"; reqId: string };

export type P2WMessage =
  | { reqId: string; result: unknown }
  | { reqId: string; error: string };
