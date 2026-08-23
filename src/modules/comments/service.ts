import { prisma } from '../../infrastructure/database/prisma';
import { ForbiddenError, NotFoundError } from '../../shared/errors/httpError';
import { getScopedTask } from '../common';
export async function list(taskId: string, organizationId: string) {
  await getScopedTask(taskId, organizationId);
  return prisma.comment.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
export async function create(taskId: string, organizationId: string, userId: string, body: string) {
  await getScopedTask(taskId, organizationId);
  return prisma.comment.create({ data: { taskId, userId, body } });
}
export async function update(
  commentId: string,
  organizationId: string,
  userId: string,
  body: string,
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { task: { include: { project: true } } },
  });
  if (!comment) throw new NotFoundError('Comment not found');
  if (comment.task.project.organizationId !== organizationId || comment.userId !== userId)
    throw new ForbiddenError('Access denied');
  return prisma.comment.update({ where: { id: commentId }, data: { body } });
}
export async function remove(commentId: string, organizationId: string, userId: string) {
  await update(
    commentId,
    organizationId,
    userId,
    (await prisma.comment.findUniqueOrThrow({ where: { id: commentId } })).body,
  );
  await prisma.comment.delete({ where: { id: commentId } });
}
