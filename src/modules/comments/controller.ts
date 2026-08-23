import type { Request, Response } from 'express';
import * as service from './service';
import { currentAuth } from '../common';

export const list = async (req: Request, res: Response) =>
  res.json({ data: await service.list(req.params.taskId, currentAuth(req).organizationId) });
export const create = async (req: Request, res: Response) => {
  const auth = currentAuth(req);
  res.status(201).json({
    data: await service.create(req.params.taskId, auth.organizationId, auth.userId, req.body.body),
  });
};
export const update = async (req: Request, res: Response) => {
  const auth = currentAuth(req);
  res.json({
    data: await service.update(
      req.params.commentId,
      auth.organizationId,
      auth.userId,
      req.body.body,
    ),
  });
};
export const remove = async (req: Request, res: Response) => {
  const auth = currentAuth(req);
  await service.remove(req.params.commentId, auth.organizationId, auth.userId);
  res.status(204).send();
};
