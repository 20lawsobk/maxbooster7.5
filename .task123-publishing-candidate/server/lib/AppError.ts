export interface ErrorContext {
  service?: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error {
  public code?: string;
  public statusCode: number;
  public isOperational: boolean;
  public context?: ErrorContext;

  /**
   * Supports two constructor shapes used in the codebase:
   *  - Code-first: (code: string, statusCode: number, message: string, context?: ErrorContext)
   *  - Message-first: (message: string, statusCode?: number, isOperational?: boolean, code?: string, context?: ErrorContext)
   */
  constructor(...args: unknown[]) {
    // code-first detection: first arg looks like an UPPER_SNAKE code and second arg is a number
    if (
      typeof args[0] === "string" &&
      /^[A-Z0-9_]+$/.test(args[0]) &&
      typeof args[1] === "number" &&
      typeof args[2] === "string"
    ) {
      const [code, statusCode, message, context] = args as [string, number, string, ErrorContext?];
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.context = context;
      this.isOperational = true;
    } else {
      // message-first fallback
      const message = (args[0] as string) || "Error";
      const statusCode = typeof args[1] === "number" ? (args[1] as number) : 500;
      const isOperational = typeof args[2] === "boolean" ? (args[2] as boolean) : true;
      const code = typeof args[3] === "string" ? (args[3] as string) : undefined;
      const context = args[4] as ErrorContext | undefined;

      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.context = context;
    }

    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor as any);
  }
}
