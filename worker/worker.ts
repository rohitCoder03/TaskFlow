import { createWorker } from '../src/infrastructure/queue/jobs';
import { logger } from '../src/config/logger';
import { prisma } from '../src/infrastructure/database/prisma';
import { emailQueue } from '../src/infrastructure/queue/queues';
import { closeInfrastructure } from '../src/infrastructure/shutdown';
import { processEmailJob } from './processors/email.processor';

async function startWorker() {
  const worker = await createWorker('email', processEmailJob);

  const publishOutbox = async () => {
    try {
      const events = await prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const event of events) {
        const payload = event.payload as { to: string; title: string };
        const job = await emailQueue.add('task-assignment-notification', payload, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        });
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
        logger.info(`Published outbox event ${event.id} as job ${job.id}`);
      }
    } catch (error) {
      logger.error('Failed to publish outbox events', {}, error);
    }
  };

  const publisher = setInterval(() => void publishOutbox(), 1000);

  logger.info('TaskFlow worker started');

  const shutdown = async (signal: string) => {
    logger.info('Shutting down worker', { signal });
    clearInterval(publisher);
    await worker.close();
    await closeInfrastructure();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  return worker;
}

startWorker().catch((error) => {
  logger.error('Worker crashed', {}, error);
  void closeInfrastructure().finally(() => process.exit(1));
});
