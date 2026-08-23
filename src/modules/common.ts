import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../infrastructure/database/prisma';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../shared/errors/httpError';

export const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req, res, next).catch(next);

export const currentAuth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

export async function getScopedProject(projectId: string, organizationId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true },
  });
  if (!project) throw new NotFoundError('Project not found');
  if (project.organizationId !== organizationId) throw new ForbiddenError('Access denied');
  return project;
}

export async function getScopedTask(taskId: string, organizationId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!task) throw new NotFoundError('Task not found');
  if (task.project.organizationId !== organizationId) throw new ForbiddenError('Access denied');
  return task;
}
