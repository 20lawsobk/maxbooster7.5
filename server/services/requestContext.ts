import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  requestId: string;
  userId?: number;
  startTime: number;
  path: string;
  method: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

class RequestContextService {
  private storage: AsyncLocalStorage<RequestContextData>;

  constructor() {
    this.storage = new AsyncLocalStorage<RequestContextData>();
  }

  run<T>(context: RequestContextData, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  getContext(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  getUserId(): number | undefined {
    return this.storage.getStore()?.userId;
  }

  getStartTime(): number | undefined {
    return this.storage.getStore()?.startTime;
  }

  getPath(): string | undefined {
    return this.storage.getStore()?.path;
  }

  getMethod(): string | undefined {
    return this.storage.getStore()?.method;
  }

  getDuration(): number | undefined {
    const startTime = this.storage.getStore()?.startTime;
    if (startTime) {
      return Date.now() - startTime;
    }
    return undefined;
  }

  setUserId(userId: number): void {
    const store = this.storage.getStore();
    if (store) {
      store.userId = userId;
    }
  }

  updateContext(updates: Partial<RequestContextData>): void {
    const store = this.storage.getStore();
    if (store) {
      Object.assign(store, updates);
    }
  }
}

export const requestContext = new RequestContextService();
