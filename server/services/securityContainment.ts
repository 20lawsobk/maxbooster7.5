/**
 * Narrow process-local enforcement. Targets come from server-owned route
 * bindings, never from request bodies/headers. Fleet persistence is not implied.
 */
export type ContainmentEffect = {
  confirmed: true;
  target: string;
  scope: "user" | "process";
  expiresAt?: number;
};

export interface ContainmentAdapters {
  actionsForPath?(path: string): Array<"circuit_break" | "feature_disable">;
  revokeSessions(userId: string): Promise<ContainmentEffect>;
  isolateDependency(path: string): Promise<ContainmentEffect>;
  isolateFeature(path: string): Promise<ContainmentEffect>;
}

type RouteBinding = { prefix: string; target: string };
type Options = {
  revokeSessions?: (userId: string) => Promise<{ confirmed: true }>;
  dependencies?: readonly RouteBinding[];
  features?: readonly RouteBinding[];
  now?: () => number;
  durationMs?: number;
};

export class ContainmentDeniedError extends Error {
  readonly code = "SECURITY_CONTAINMENT";
  constructor(readonly target: string) {
    super(`Security containment denies ${target}`);
  }
}

export class SecurityContainment implements ContainmentAdapters {
  private readonly dependencies = new Map<string, number>();
  private readonly features = new Map<string, number>();
  private readonly now: () => number;
  private readonly durationMs: number;
  private readonly options: Options;

  constructor(options: Options = {}) {
    this.options = {
      ...options,
      dependencies: options.dependencies?.map((binding) => ({ ...binding })),
      features: options.features?.map((binding) => ({ ...binding })),
    };
    this.now = options.now ?? Date.now;
    this.durationMs = options.durationMs ?? 60_000;
    if (!Number.isFinite(this.durationMs) || this.durationMs < 1 || this.durationMs > 300_000) {
      throw new Error("Containment duration must be between 1 and 300000ms");
    }
    for (const binding of [...(this.options.dependencies ?? []), ...(this.options.features ?? [])]) {
      if (!binding.prefix.startsWith("/api/") || binding.prefix.endsWith("/") || !binding.target.trim()) {
        throw new Error("Containment requires a specific /api route prefix and target");
      }
    }
  }

  async revokeSessions(userId: string): Promise<ContainmentEffect> {
    if (!userId.trim() || !this.options.revokeSessions) {
      throw new Error("Confirmed session revocation adapter and authenticated user ID required");
    }
    const result = await this.options.revokeSessions(userId);
    if (result?.confirmed !== true) throw new Error("Session revocation was not confirmed");
    return { confirmed: true, target: userId, scope: "user" };
  }

  actionsForPath(path: string): Array<"circuit_break" | "feature_disable"> {
    const matches = (bindings: readonly RouteBinding[] = []) =>
      bindings.some(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
    const actions: Array<"circuit_break" | "feature_disable"> = [];
    if (matches(this.options.dependencies)) actions.push("circuit_break");
    if (matches(this.options.features)) actions.push("feature_disable");
    return actions;
  }

  private target(path: string, bindings: readonly RouteBinding[] = []): string {
    const binding = [...bindings]
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
    if (!binding) throw new Error("No server-owned containment binding for this path");
    return binding.target;
  }

  private isolate(target: string, states: Map<string, number>): ContainmentEffect {
    // Repeated delivery must not extend an incident indefinitely.
    const current = states.get(target);
    const expiresAt = current && current > this.now() ? current : this.now() + this.durationMs;
    states.set(target, expiresAt);
    return { confirmed: true, target, scope: "process", expiresAt };
  }

  async isolateDependency(path: string): Promise<ContainmentEffect> {
    return this.isolate(this.target(path, this.options.dependencies), this.dependencies);
  }

  async isolateFeature(path: string): Promise<ContainmentEffect> {
    return this.isolate(this.target(path, this.options.features), this.features);
  }

  private assertAllowed(target: string, states: Map<string, number>): void {
    const expiry = states.get(target);
    if (expiry !== undefined && expiry > this.now()) throw new ContainmentDeniedError(target);
    states.delete(target);
  }

  /** Call at the dependency owner before invoking the external service. */
  async executeDependency<T>(target: string, operation: () => Promise<T>): Promise<T> {
    this.assertAllowed(target, this.dependencies);
    return operation();
  }

  /** Call at the feature authorization boundary, including non-HTTP callers. */
  assertFeatureAllowed(target: string): void {
    this.assertAllowed(target, this.features);
  }

  /** Express-compatible guard; mount before the bound API handlers. */
  guard = (
    req: { path: string },
    res: { status(code: number): { json(body: unknown): unknown } },
    next: () => void,
  ): void => {
    try {
      for (const [bindings, states] of [
        [this.options.dependencies ?? [], this.dependencies],
        [this.options.features ?? [], this.features],
      ] as const) {
        for (const binding of bindings) {
          if (req.path === binding.prefix || req.path.startsWith(`${binding.prefix}/`)) {
            this.assertAllowed(binding.target, states);
          }
        }
      }
    } catch (error) {
      if (!(error instanceof ContainmentDeniedError)) throw error;
      res.status(503).json({ error: "Temporarily isolated by security policy", code: error.code });
      return;
    }
    next();
  };

  /** Trusted operator API only; do not expose without authorization. */
  restore(kind: "dependency" | "feature", target: string): void {
    (kind === "dependency" ? this.dependencies : this.features).delete(target);
  }
}

let applicationControl: SecurityContainment | undefined;

/** Call once from application composition after authoritative auth is installed.
 * No imports of auth/DB modules here: session verification remains owner-provided.
 * Repeated composition is rejected rather than silently replacing live state.
 */
export function configureApplicationContainment(
  engine: { configureContainment(adapters: ContainmentAdapters): void },
  revokeSessions: (userId: string) => Promise<{ confirmed: true }>,
): SecurityContainment {
  if (applicationControl) throw new Error("Application containment already composed");
  const control = new SecurityContainment({
    revokeSessions,
    dependencies: [{ prefix: "/api/autopilot/predict-engagement", target: "autopilot-prediction" }],
    features: [{ prefix: "/api/auto-updates/run-once", target: "evolution-manual-cycle" }],
  });
  engine.configureContainment(control);
  applicationControl = control;
  return control;
}

export function getApplicationContainment(): SecurityContainment {
  if (!applicationControl) throw new Error("Application containment is not composed");
  return applicationControl;
}