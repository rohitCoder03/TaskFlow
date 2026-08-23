import type { Request, Response } from 'express';
import * as service from './service';
import { currentAuth } from '../common';

export const list = async (req: Request, res: Response) =>
  res.json({ data: await service.listProjects(currentAuth(req).organizationId) });
export const create = async (req: Request, res: Response) =>
  res
    .status(201)
    .json({ data: await service.createProject(currentAuth(req).organizationId, req.body) });
export const createTask = async (req: Request, res: Response) =>
  res.status(201).json({
    data: await service.createTask(req.params.projectId, currentAuth(req).organizationId, req.body),
  });
export const get = async (req: Request, res: Response) =>
  res.json({
    data: await service.findProject(req.params.projectId, currentAuth(req).organizationId),
  });
export const update = async (req: Request, res: Response) =>
  res.json({
    data: await service.updateProject(
      req.params.projectId,
      currentAuth(req).organizationId,
      req.body,
    ),
  });
export const remove = async (req: Request, res: Response) => {
  await service.deleteProject(req.params.projectId, currentAuth(req).organizationId);
  res.status(204).send();
};
export const dashboard = async (req: Request, res: Response) =>
  res.json({
    data: await service.dashboard(req.params.projectId, currentAuth(req).organizationId),
  });
