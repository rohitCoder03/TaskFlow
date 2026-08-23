import type { Request, Response } from 'express';
import * as service from './service';
import { currentAuth } from '../common';

export const list = async (req: Request, res: Response) =>
  res.json({ data: await service.listTasks(currentAuth(req).organizationId, req.query) });
export const get = async (req: Request, res: Response) =>
  res.json({ data: await service.findTask(req.params.taskId, currentAuth(req).organizationId) });
export const update = async (req: Request, res: Response) =>
  res.json({
    data: await service.updateTask(req.params.taskId, currentAuth(req).organizationId, req.body),
  });
export const remove = async (req: Request, res: Response) => {
  await service.deleteTask(req.params.taskId, currentAuth(req).organizationId);
  res.status(204).send();
};
export const assign = async (req: Request, res: Response) => {
  const result = await service.assignTask(
    req.params.taskId,
    currentAuth(req).organizationId,
    req.body.userId,
  );
  res.status(201).json({ data: result });
};
export const unassign = async (req: Request, res: Response) => {
  await service.unassignTask(req.params.taskId, currentAuth(req).organizationId, req.params.userId);
  res.status(204).send();
};
