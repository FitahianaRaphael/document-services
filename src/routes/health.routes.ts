import { Router } from 'express';
import mongoose from 'mongoose';
import { getQueue } from '../services/queue.service';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks = {
    mongodb: mongoose.connection.readyState === 1 ? 'up' : 'down',
    redis:   'unknown' as string,
    queue:   'unknown' as string,
    uptime:  process.uptime(),
    timestamp: new Date().toISOString(),
  };

  try {
    const queue = getQueue();
    await queue.isReady();
    checks.redis = 'up';
    checks.queue = 'up';
  } catch {
    checks.redis = 'down';
    checks.queue = 'down';
  }

  const allUp = checks.mongodb === 'up' && checks.redis === 'up';
  res.status(allUp ? 200 : 503).json(checks);
});