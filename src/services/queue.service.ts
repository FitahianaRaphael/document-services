import Bull from 'bull';
import { config } from '../config';
import { queueSize } from '../utils/metrics';
import { logger } from '../utils/logger';

let _queue: Bull.Queue | null = null;

const inMemoryQueue: Array<Bull.Job['data']> = [];
let redisAvailable = true;

export function getQueue(): Bull.Queue {
  if (!_queue) {
    _queue = new Bull('document-generation', {
      redis: { host: config.redis.host, port: config.redis.port },
      defaultJobOptions: {
        attempts: config.queue.retries,
        backoff: { type: 'exponential', delay: config.queue.backoffDelay },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    _queue.on('error', (err) => {
      logger.error({ msg: 'Redis/Bull error — switching to in-memory fallback', error: err.message });
      redisAvailable = false;
    });

    _queue.on('waiting', async () => {
      const cnt = await _queue!.getWaitingCount();
      queueSize.set(cnt);
    });
  }
  return _queue;
}

export async function enqueueDocument(data: {
  documentId: string;
  userId: string;
  batchId: string;
}): Promise<void> {
  if (!redisAvailable) {
    // Fallback : traitement en mémoire (limité, pour la résilience)
    inMemoryQueue.push(data);
    logger.warn({ msg: 'Job pushed to in-memory fallback queue', ...data });
    return;
  }
  await getQueue().add(data);
}