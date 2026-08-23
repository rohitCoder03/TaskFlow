import { TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { ForbiddenError } from '../../shared/errors/httpError';
import { getScopedTask } from '../common';

export async function listTasks(
  organizationId: string,
  filters: {
    page?: unknown;
    limit?: unknown;
    projectId?: unknown;
    status?: unknown;
    priority?: unknown;
    assignee?: unknown;
  },
) {
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
  const where = {
    project: { organizationId },
    ...(filters.projectId ? { projectId: String(filters.projectId) } : {}),
    ...(filters.status ? { status: String(filters.status) as TaskStatus } : {}),
    ...(filters.priority ? { priority: String(filters.priority) as TaskPriority } : {}),
    ...(filters.assignee ? { assignments: { some: { userId: String(filters.assignee) } } } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.count({ where }),
  ]);
  return { data, pagination: { page, limit, total } };
}

export const findTask = getScopedTask;
export async function updateTask(
  taskId: string,
  organizationId: string,
  data: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: Date | null;
  },
) {
  await getScopedTask(taskId, organizationId);
  return prisma.task.update({ where: { id: taskId }, data });
}
export async function deleteTask(taskId: string, organizationId: string) {
  await getScopedTask(taskId, organizationId);
  await prisma.task.delete({ where: { id: taskId } });
}
export async function assignTask(taskId: string, organizationId: string, userId: string) {
  const task = await getScopedTask(taskId, organizationId);
  const member = await prisma.orgMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { user: true },
  });
  if (!member) throw new ForbiddenError('Assignee must belong to this organization');
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.taskAssignment.create({ data: { taskId: task.id, userId } });
    await tx.outboxEvent.create({
      data: {
        type: 'task.assigned',
        payload: { taskId: task.id, userId, to: member.user.email, title: task.title },
      },
    });
    return assignment;
  });
}
export async function unassignTask(taskId: string, organizationId: string, userId: string) {
  await getScopedTask(taskId, organizationId);
  await prisma.taskAssignment.deleteMany({ where: { taskId, userId } });
}
