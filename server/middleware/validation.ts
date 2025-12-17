import { z, ZodType, ZodError, ZodObject, ZodRawShape } from 'zod';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';

export interface ValidationSchema {
  body?: ZodType<any>;
  query?: ZodType<any>;
  params?: ZodType<any>;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationErrorResponse {
  error: string;
  details: ValidationErrorDetail[];
}

export const validateRequest = <
  TBody extends ZodType<any> = ZodType<any>,
  TQuery extends ZodType<any> = ZodType<any>,
  TParams extends ZodType<any> = ZodType<any>,
>(schema: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query) as any;
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params) as any;
      }
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const errorResponse: ValidationErrorResponse = {
          error: 'Validation failed',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        };

        logger.warn('Request validation failed:', {
          path: req.path,
          method: req.method,
          errors: errorResponse.details,
        });

        return res.status(400).json(errorResponse);
      }
      next(error);
    }
  };
};

export const validateBody = <T extends ZodType<any>>(
  schema: T
): RequestHandler => {
  return validateRequest({ body: schema });
};

export const validateQuery = <T extends ZodType<any>>(
  schema: T
): RequestHandler => {
  return validateRequest({ query: schema });
};

export const validateParams = <T extends ZodType<any>>(
  schema: T
): RequestHandler => {
  return validateRequest({ params: schema });
};

export type InferBody<T extends ValidationSchema> = T['body'] extends ZodType<infer U> ? U : never;
export type InferQuery<T extends ValidationSchema> = T['query'] extends ZodType<infer U> ? U : never;
export type InferParams<T extends ValidationSchema> = T['params'] extends ZodType<infer U> ? U : never;

export interface TypedRequest<
  TBody = any,
  TQuery = any,
  TParams = any,
> extends Request {
  body: TBody;
  query: TQuery;
  params: TParams;
}

export function createTypedHandler<
  TBody extends ZodType<any>,
  TQuery extends ZodType<any>,
  TParams extends ZodType<any>,
>(
  schema: { body?: TBody; query?: TQuery; params?: TParams },
  handler: (
    req: TypedRequest<
      TBody extends ZodType<infer U> ? U : any,
      TQuery extends ZodType<infer U> ? U : any,
      TParams extends ZodType<infer U> ? U : any
    >,
    res: Response,
    next: NextFunction
  ) => Promise<void> | void
): RequestHandler[] {
  return [validateRequest(schema), handler as RequestHandler];
}
