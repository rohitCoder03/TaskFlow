import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncRoute } from '../common';
import * as controller from './controller';

const router = Router();
router.use(authenticate);
router.get('/', asyncRoute(controller.list));
router.post(
  '/',
  validate(
    z.object({ body: z.object({ name: z.string().min(1), description: z.string().optional() }) }),
  ),
  asyncRoute(controller.create),
);
router.post(
  '/:projectId/tasks',
  validate(
    z.object({
      params: z.object({ projectId: z.string().uuid() }),
      body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        dueDate: z.coerce.date().nullable().optional(),
      }),
    }),
  ),
  asyncRoute(controller.createTask),
);
router.get('/:projectId', asyncRoute(controller.get));
router.patch(
  '/:projectId',
  validate(
    z.object({
      body: z.object({ name: z.string().min(1).optional(), description: z.string().optional() }),
    }),
  ),
  asyncRoute(controller.update),
);
router.delete('/:projectId', requireRole(Role.org_admin), asyncRoute(controller.remove));
router.get('/:projectId/dashboard', asyncRoute(controller.dashboard));
export default router;
