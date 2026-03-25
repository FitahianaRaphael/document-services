import mongoose from 'mongoose';
import http     from 'http';
import { createApp } from './app';
import { config }    from './config';
import { logger }    from './utils/logger';

async function bootstrap(): Promise<void> {
  try {
    await mongoose.connect(config.mongodb.uri);
    logger.info({ msg: 'MongoDB connected' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ msg: 'MongoDB connection failed', error: msg });
    process.exit(1);
  }

  const app    = createApp();
  const server = http.createServer(app);

  server.listen(config.port, () => {
    logger.info({ msg: `Server started on port ${config.port}`, env: config.nodeEnv });
  });

  // Graceful shutdown — pas d'await nécessaire, on utilise le callback de server.close
  const shutdown = (signal: string): void => {
    logger.info({ msg: `${signal} received — shutting down gracefully` });
    server.close(() => {
      mongoose.disconnect().finally(() => {
        logger.info({ msg: 'Shutdown complete' });
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ msg: 'Fatal error during bootstrap', error: msg });
  process.exit(1);
});

