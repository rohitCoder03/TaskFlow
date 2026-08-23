import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../infrastructure/database/prisma';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export function issueAccessToken(userId: string, organizationId: string) {
  return jwt.sign({ orgId: organizationId }, env.jwtAccessSecret, {
    subject: userId,
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
  });
}

export async function issueRefreshToken(userId: string, organizationId: string) {
  const token = jwt.sign({ orgId: organizationId, type: 'refresh' }, env.jwtRefreshSecret, {
    subject: userId,
    expiresIn: env.refreshTokenTtl as SignOptions['expiresIn'],
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: digest(token), expiresAt } });
  return token;
}

export function hashToken(token: string) {
  return digest(token);
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload & { orgId: string; type: string };
}
