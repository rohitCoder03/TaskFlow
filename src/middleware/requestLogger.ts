import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

function requestIdFromHeader(value: string | undefined) {
  if (value && /^[a-zA-Z0-9._:-]{1,128}$/.test(value)) return value;
  return crypto.randomUUID();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = requestIdFromHeader(req.header('x-request-id'));
  res.setHeader('x-request-id', req.requestId);
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info('HTTP request completed', {
      request_id: req.requestId,
      user_id: req.auth?.userId,
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
    });
  });

  next();
}
