import { prisma } from './database/prisma';
import { emailQueue, jobQueue } from './queue/queues';
import { redis } from './redis/redis';

let shutdownPromise: Promise<void> | undefined;

export function closeInfrastructure() {
  shutdownPromise ??= Promise.all([
    prisma.$disconnect(),
    redis.quit(),
    emailQueue.close(),
    jobQueue.close(),
  ]).then(() => undefined);

  return shutdownPromise;
}
