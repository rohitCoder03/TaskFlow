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

router.get('/members', asyncRoute(controller.list));

router.post(
  '/members',
  requireRole(Role.org_admin),
  validate(
    z.object({
      body: z.object({
        email: z.string().email(),
        name: z.string().min(2),
        password: z.string().min(8),
        role: z.nativeEnum(Role).optional(),
      }),
    }),
  ),
  asyncRoute(controller.add),
);

router.patch(
  '/members/:userId',
  requireRole(Role.org_admin),
  validate(
    z.object({
      params: z.object({ userId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(Role) }),
    }),
  ),
  asyncRoute(controller.update),
);

router.delete('/members/:userId', requireRole(Role.org_admin), asyncRoute(controller.remove));
export default router;
