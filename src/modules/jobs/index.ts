import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncRoute } from '../common';
import * as controller from './controller';

const router = Router();
router.use(authenticate);
router.get('/:jobId', asyncRoute(controller.getStatus));
export default router;
