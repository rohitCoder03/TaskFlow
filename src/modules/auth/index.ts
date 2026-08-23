import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute } from '../common';
import { validate } from '../../middleware/validate';
import * as controller from './controller';

const router = Router();
export const registrationSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    organizationName: z.string().min(2),
  }),
});

router.post('/register', validate(registrationSchema), asyncRoute(controller.register));

router.post(
  '/login',
  validate(z.object({ body: z.object({ email: z.string().email(), password: z.string() }) })),
  asyncRoute(controller.login),
);

router.post(
  '/refresh',
  validate(z.object({ body: z.object({ refreshToken: z.string().min(1) }) })),
  asyncRoute(controller.refresh),
);

router.post(
  '/logout',
  validate(z.object({ body: z.object({ refreshToken: z.string().min(1) }) })),
  asyncRoute(controller.logout),
);

export default router;
