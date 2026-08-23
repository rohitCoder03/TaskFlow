import { Queue } from 'bullmq';
import { env } from '../../config/env';

export const connection = {
  connection: { url: env.redisUrl },
};

export const emailQueue = new Queue('email', connection);
export const jobQueue = new Queue('taskflow-jobs', connection);
