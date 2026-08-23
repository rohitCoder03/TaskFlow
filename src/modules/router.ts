import { Router } from 'express';
import authRouter from './auth';
import organizationRouter from './organizations';
import projectRouter from './projects';
import taskRouter from './tasks';
import commentRouter from './comments';
import jobRouter from './jobs';

const router = Router();

router.use('/auth', authRouter);
router.use('/', organizationRouter);
router.use('/projects', projectRouter);
router.use('/tasks', taskRouter);
router.use('/', commentRouter);
router.use('/jobs', jobRouter);

export default router;
