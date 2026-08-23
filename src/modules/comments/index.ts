import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncRoute } from '../common';
import * as controller from './controller';

const router = Router();
router.use(authenticate);
router.get('/tasks/:taskId/comments', asyncRoute(controller.list));
router.post(
  '/tasks/:taskId/comments',
  validate(z.object({ body: z.object({ body: z.string().min(1) }) })),
  asyncRoute(controller.create),
);
router.patch(
  '/comments/:commentId',
  validate(z.object({ body: z.object({ body: z.string().min(1) }) })),
  asyncRoute(controller.update),
);
router.delete('/comments/:commentId', asyncRoute(controller.remove));
export default router;
