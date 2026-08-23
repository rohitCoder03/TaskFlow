import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './service';

export const register = async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof import('./index').registrationSchema>['body'];
  res.status(201).json({ data: await service.register(input) });
};
export const login = async (req: Request, res: Response) => {
  res.json({ data: await service.login(req.body as { email: string; password: string }) });
};
export const refresh = async (req: Request, res: Response) => {
  res.json({ data: await service.refresh((req.body as { refreshToken: string }).refreshToken) });
};
export const logout = async (req: Request, res: Response) => {
  await service.logout((req.body as { refreshToken: string }).refreshToken);
  res.status(204).send();
};
