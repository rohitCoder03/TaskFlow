import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncRoute } from '../common';
import * as controller from './controller';
import { TaskPriority, TaskStatus } from '@prisma/client';

const router = Router();
router.use(authenticate);
const taskData = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});
router.get('/', asyncRoute(controller.list));
router.get('/:taskId', asyncRoute(controller.get));
router.patch(
  '/:taskId',
  validate(z.object({ body: taskData.partial() })),
  asyncRoute(controller.update),
);
router.delete('/:taskId', asyncRoute(controller.remove));
router.post(
  '/:taskId/assignments',
  validate(z.object({ body: z.object({ userId: z.string().uuid() }) })),
  asyncRoute(controller.assign),
);
router.delete('/:taskId/assignments/:userId', asyncRoute(controller.unassign));
export default router;
