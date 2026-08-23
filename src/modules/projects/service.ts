import { prisma } from '../../infrastructure/database/prisma';
import { ForbiddenError, NotFoundError } from '../../shared/errors/httpError';
import { getScopedProject } from '../common';

export const listProjects = (organizationId: string) =>
  prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
export const createProject = (
  organizationId: string,
  data: { name: string; description?: string },
) => prisma.project.create({ data: { ...data, organizationId } });
export const findProject = getScopedProject;
export async function updateProject(
  projectId: string,
  organizationId: string,
  data: { name?: string; description?: string },
) {
  const project = await getScopedProject(projectId, organizationId);
  return prisma.project.update({ where: { id: project.id }, data });
}
export async function deleteProject(projectId: string, organizationId: string) {
  const project = await getScopedProject(projectId, organizationId);
  await prisma.project.delete({ where: { id: project.id } });
}
export async function dashboard(projectId: string, organizationId: string) {
  const project = await getScopedProject(projectId, organizationId);
  const groups = await prisma.task.groupBy({
    by: ['status'],
    where: { projectId: project.id },
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
}
export async function createTask(
  projectId: string,
  organizationId: string,
  data: {
    title: string;
    description?: string;
    status?: 'todo' | 'in_progress' | 'review' | 'done';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dueDate?: Date | null;
  },
) {
  const project = await getScopedProject(projectId, organizationId);
  return prisma.task.create({ data: { ...data, projectId: project.id } });
}
