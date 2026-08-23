import { emailQueue } from '../../infrastructure/queue/queues';
import { NotFoundError } from '../../shared/errors/httpError';
export async function getStatus(jobId: string) {
  const job = await emailQueue.getJob(jobId);
  if (!job) throw new NotFoundError('Job not found');
  const status = await job.getState();
  return {
    jobId: job.id,
    status,
    attemptsMade: job.attemptsMade,
    type: job.name,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    failedReason: job.failedReason || null,
  };
}
