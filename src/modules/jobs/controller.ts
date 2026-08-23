import type { Request, Response } from 'express';
import * as service from './service';

export const getStatus = async (req: Request, res: Response) => {
  res.json({ data: await service.getStatus(req.params.jobId) });
};
