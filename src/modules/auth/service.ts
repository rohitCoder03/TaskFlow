import { Role } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError, UnauthorizedError } from '../../shared/errors/httpError';
import { comparePasswords, hashPassword } from '../../shared/utils/password';
import {
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from '../../shared/utils/tokens';

export async function register(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } }))
    throw new AppError('Email is already registered', 409, 'EMAIL_EXISTS');
  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.organizationName } });
    const user = await tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash: await hashPassword(input.password),
        organizationId: organization.id,
      },
    });
    await tx.orgMember.create({
      data: { organizationId: organization.id, userId: user.id, role: Role.org_admin },
    });
    return { organization, user };
  });
  return {
    user: { id: result.user.id, name: result.user.name, email },
    organization: result.organization,
    accessToken: issueAccessToken(result.user.id, result.organization.id),
    refreshToken: await issueRefreshToken(result.user.id, result.organization.id),
  };
}
export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { memberships: true },
  });
  if (!user || !(await comparePasswords(input.password, user.passwordHash)) || !user.memberships[0])
    throw new UnauthorizedError('Invalid email or password');
  const membership = user.memberships[0];
  return {
    accessToken: issueAccessToken(user.id, membership.organizationId),
    refreshToken: await issueRefreshToken(user.id, membership.organizationId),
    user: { id: user.id, name: user.name, email: user.email },
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
export async function refresh(token: string) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  const stored = await prisma.refreshToken.findFirst({
    where: {
      userId: payload.sub,
      tokenHash: hashToken(token),
      revoked: false,
      expiresAt: { gt: new Date() },
    },
  });
  if (!stored) throw new UnauthorizedError('Refresh token has been revoked');
  return { accessToken: issueAccessToken(payload.sub!, payload.orgId) };
}
export async function logout(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revoked: true },
  });
}
