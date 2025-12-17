import { EventEmitter } from 'events';
import { logger } from '../logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  resetTimeout: number;
  monitorInterval: number;
  timeout: number;
  successThreshold?: number;
  volumeThreshold?: number;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  failureRate: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  isHealthy: boolean;
}

export interface CircuitBreakerEvent {
  name: string;
  type: 'state_change' | 'failure' | 'success' | 'timeout' | 'fallback';
  previousState?: CircuitState;
  newState?: CircuitState;
  error?: Error;
  timestamp: Date;
}

export class CircuitBreakerError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly state: CircuitState,
    message: string
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class TimeoutError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly timeoutMs: number
  ) {
    super(`${serviceName} timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalRequests = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private resetTimer: NodeJS.Timeout | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private halfOpenRequests = 0;
  private readonly maxHalfOpenRequests = 3;

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.options = {
      name: options.name,
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      monitorInterval: options.monitorInterval ?? 5000,
      timeout: options.timeout ?? 10000,
      successThreshold: options.successThreshold ?? 3,
      volumeThreshold: options.volumeThreshold ?? 10,
    };

    this.startMonitoring();
    logger.info(`🔌 Circuit breaker initialized: ${this.options.name}`);
  }

  get name(): string {
    return this.options.name;
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T> | T): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = this.lastFailure
        ? Date.now() - this.lastFailure.getTime()
        : this.options.resetTimeout;

      if (elapsed >= this.options.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        if (fallback) {
          this.emitEvent('fallback');
          return Promise.resolve(fallback());
        }
        throw new CircuitBreakerError(
          this.options.name,
          this.state,
          `Circuit breaker ${this.options.name} is OPEN. Service temporarily unavailable.`
        );
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenRequests >= this.maxHalfOpenRequests) {
      if (fallback) {
        this.emitEvent('fallback');
        return Promise.resolve(fallback());
      }
      throw new CircuitBreakerError(
        this.options.name,
        this.state,
        `Circuit breaker ${this.options.name} is in HALF_OPEN state with max requests reached.`
      );
    }

    this.totalRequests++;
    if (this.state === 'HALF_OPEN') {
      this.halfOpenRequests++;
    }

    try {
      const result = await this.withTimeout(fn(), this.options.timeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);

      if (fallback) {
        this.emitEvent('fallback');
        return Promise.resolve(fallback());
      }

      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(this.options.name, ms));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      if (error instanceof TimeoutError) {
        this.emitEvent('timeout', error);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccess = new Date();
    this.emitEvent('success');

    if (this.state === 'HALF_OPEN') {
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.transitionTo('CLOSED');
        this.halfOpenRequests = 0;
      }
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailure = new Date();
    this.emitEvent('failure', error);

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      this.halfOpenRequests = 0;
    } else if (this.state === 'CLOSED') {
      if (this.consecutiveFailures >= this.options.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    if (newState === 'OPEN') {
      this.resetTimer = setTimeout(() => {
        this.transitionTo('HALF_OPEN');
      }, this.options.resetTimeout);
    }

    if (newState === 'CLOSED') {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    }

    logger.info(
      `🔌 Circuit breaker ${this.options.name}: ${previousState} → ${newState}`
    );

    this.emit('state_change', {
      name: this.options.name,
      type: 'state_change',
      previousState,
      newState,
      timestamp: new Date(),
    });
  }

  private emitEvent(
    type: CircuitBreakerEvent['type'],
    error?: Error
  ): void {
    this.emit(type, {
      name: this.options.name,
      type,
      error,
      timestamp: new Date(),
    });
  }

  private startMonitoring(): void {
    this.monitorTimer = setInterval(() => {
      this.emit('health_check', this.getStats());
    }, this.options.monitorInterval);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    const failureRate =
      this.totalRequests > 0
        ? Math.round((this.failures / this.totalRequests) * 100 * 100) / 100
        : 0;

    return {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalRequests: this.totalRequests,
      failureRate,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      isHealthy: this.state === 'CLOSED',
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalRequests = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.halfOpenRequests = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    logger.info(`🔌 Circuit breaker ${this.options.name} reset`);
    this.emit('reset', { name: this.options.name, timestamp: new Date() });
  }

  forceOpen(): void {
    this.transitionTo('OPEN');
  }

  forceClose(): void {
    this.transitionTo('CLOSED');
  }

  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    this.removeAllListeners();
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  serviceName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(serviceName, ms));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private breakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  register(breaker: CircuitBreaker): void {
    this.breakers.set(breaker.name, breaker);
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getAllStats(): CircuitBreakerStats[] {
    return this.getAll().map((b) => b.getStats());
  }

  getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    circuits: CircuitBreakerStats[];
  } {
    const stats = this.getAllStats();
    const healthy = stats.filter((s) => s.isHealthy).length;

    return {
      total: stats.length,
      healthy,
      unhealthy: stats.length - healthy,
      circuits: stats,
    };
  }

  resetAll(): void {
    this.breakers.forEach((b) => b.reset());
  }

  destroy(): void {
    this.breakers.forEach((b) => b.destroy());
    this.breakers.clear();
  }
}

export const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
