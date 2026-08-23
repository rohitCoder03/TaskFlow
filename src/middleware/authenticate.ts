import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../infrastructure/database/prisma';
import { env } from '../config/env';
import { UnauthorizedError } from '../shared/errors/httpError';
import type { AuthContext } from '../shared/types/auth';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Bearer token required');
    const payload = jwt.verify(header.slice(7), env.jwtAccessSecret) as {
      sub?: string;
      orgId?: string;
    };
    if (!payload.sub || !payload.orgId) throw new UnauthorizedError('Invalid access token');
    const membership = await prisma.orgMember.findUnique({
      where: { organizationId_userId: { organizationId: payload.orgId, userId: payload.sub } },
    });
    if (!membership) throw new UnauthorizedError('Organization membership not found');
    req.auth = {
      userId: payload.sub,
      organizationId: payload.orgId,
      role: membership.role,
    } satisfies AuthContext;
    next();
  } catch (error) {
    next(
      error instanceof UnauthorizedError
        ? error
        : new UnauthorizedError('Invalid or expired access token'),
    );
  }
}
