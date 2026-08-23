import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../shared/errors/httpError';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const req = _req;
  logger.error('Request failed', { request_id: req.requestId, user_id: req.auth?.userId }, err);
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ error: err.message, code: err.code, details: err.details || {} });
  }

  const message = err instanceof Error ? err.message : 'Internal server error';

  return res.status(500).json({ error: message, code: 'INTERNAL_SERVER_ERROR', details: {} });
}
