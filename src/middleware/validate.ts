import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { ValidationError } from '../shared/errors/httpError';

export const validate =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success)
      return next(
        new ValidationError(
          'Request validation failed',
          result.error.flatten().fieldErrors as Record<string, unknown>,
        ),
      );
    req.body = result.data.body;
    req.params = result.data.params;
    req.query = result.data.query;
    next();
  };

export const idSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
