import http from 'node:http';
import app from './app';
import { env } from './config/env';
import { prisma } from './infrastructure/database/prisma';
import { closeInfrastructure } from './infrastructure/shutdown';
import { logger } from './config/logger';

const startServer = async () => {
  try {
    await prisma.$connect();
    const server = http.createServer(app);
    server.listen(env.port, () => {
      logger.info('TaskFlow API started', { port: env.port });
    });

    const shutdown = async (signal: string) => {
      logger.info('Shutting down API', { signal });
      server.close(async () => {
        await closeInfrastructure();
        process.exit(0);
      });
    };

    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start the API server', {}, error);
    await closeInfrastructure();
    process.exit(1);
  }
};

startServer();
