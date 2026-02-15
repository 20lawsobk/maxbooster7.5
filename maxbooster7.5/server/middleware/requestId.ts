import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestContext, RequestContextData } from '../services/requestContext.js';

export const REQUEST_ID_HEADER = 'X-Request-ID';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();

  const startTime = Date.now();

  req.requestId = requestId;
  req.startTime = startTime;

  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.setHeader('X-Correlation-ID', requestId);

  const contextData: RequestContextData = {
    requestId,
    startTime,
    path: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    sessionId: req.sessionID,
  };

  requestContext.run(contextData, () => {
    next();
  });
}

export function getRequestId(): string | undefined {
  return requestContext.getRequestId();
}

export function getCurrentContext(): RequestContextData | undefined {
  return requestContext.getContext();
}
