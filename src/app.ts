import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

import { documentsRouter } from './routes/documents.routes';
import { healthRouter }    from './routes/health.routes';
import { metricsRouter }   from './routes/metrics.routes';
import { errorHandler }    from './middleware/errorHandler';
import { apiLimiter }      from './middleware/rateLimiter';

// Typage explicite du doc Swagger pour éviter no-unsafe-assignment
const swaggerDoc = YAML.load(path.join(__dirname, '../swagger.yaml')) as Record<string, unknown>;

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiLimiter);

  app.use('/api/documents', documentsRouter);
  app.use('/health',        healthRouter);
  app.use('/metrics',       metricsRouter);

  // swagger-ui-express attend JsonObject — cast explicite
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc as Parameters<typeof swaggerUi.setup>[0]));

  app.use(errorHandler);

  return app;
}