import type { Request, Response } from 'express';
import * as service from './service';
import { currentAuth } from '../common';

export const list = async (req: Request, res: Response) =>
  res.json({ data: await service.listMembers(currentAuth(req).organizationId) });
export const add = async (req: Request, res: Response) =>
  res
    .status(201)
    .json({ data: await service.addMember(currentAuth(req).organizationId, req.body) });
export const update = async (req: Request, res: Response) =>
  res.json({
    data: await service.updateMember(
      currentAuth(req).organizationId,
      req.params.userId,
      req.body.role,
    ),
  });
export const remove = async (req: Request, res: Response) => {
  await service.removeMember(currentAuth(req).organizationId, req.params.userId);
  res.status(204).send();
};
