import { Job, Queue, Worker } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export async function enqueueJob(queue: Queue, name: string, data: Record<string, unknown>) {
  return queue.add(name, data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function createWorker(queueName: string, processor: (job: Job) => Promise<void>) {
  const worker = new Worker(queueName, async (job) => processor(job), {
    connection: { url: env.redisUrl },
    stalledInterval: 30000,
    maxStalledCount: 3,
  });

  worker.on('completed', (job) => {
    logger.info('Queue job completed', {
      job_id: job.id,
      queue: queueName,
      user_id: typeof job.data?.userId === 'string' ? job.data.userId : undefined,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(
      'Queue job failed',
      {
        job_id: job?.id,
        queue: queueName,
        user_id: typeof job?.data?.userId === 'string' ? job.data.userId : undefined,
      },
      err,
    );
  });

  return worker;
}
