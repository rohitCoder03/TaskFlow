import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './modules/router';
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(express.json());
  app.use(requestLogger);

  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'TaskFlow API',
        version: '1.0.0',
      },
    },
    apis: ['./src/**/*.ts'],
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use('/api/v1', apiRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'taskflow-api', environment: env.nodeEnv });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND', details: {} });
  });

  app.use(errorHandler);

  return app;
}

export default createApp();
