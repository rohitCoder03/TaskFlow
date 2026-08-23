import { Role } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { hashPassword } from '../../shared/utils/password';
import { AppError, NotFoundError } from '../../shared/errors/httpError';
export const listMembers = (organizationId: string) =>
  prisma.orgMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
export async function addMember(
  organizationId: string,
  input: { email: string; name: string; password: string; role?: Role },
) {
  const email = input.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    user = await prisma.user.create({
      data: { email, name: input.name, passwordHash: await hashPassword(input.password) },
    });
  try {
    return await prisma.orgMember.create({
      data: { organizationId, userId: user.id, role: input.role || Role.member },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  } catch {
    throw new AppError('User is already a member', 409, 'MEMBER_EXISTS');
  }
}
export async function updateMember(organizationId: string, userId: string, role: Role) {
  const result = await prisma.orgMember.updateMany({
    where: { organizationId, userId },
    data: { role },
  });
  if (!result.count) throw new NotFoundError('Member not found');
  return prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
}
export const removeMember = (organizationId: string, userId: string) =>
  prisma.orgMember.deleteMany({ where: { organizationId, userId } });
