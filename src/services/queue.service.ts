import Bull  from 'bull';
import Redis from 'ioredis';
import { config }    from '../config';
import { queueSize } from '../utils/metrics';
import { logger }    from '../utils/logger';

let _queue: Bull.Queue | null = null;
const inMemoryQueue: Array<Bull.Job['data']> = [];
let redisAvailable = true;

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url, {
      tls:                  url.startsWith('rediss') ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
    });
  }
  return new Redis({
    host:                 config.redis.host,
    port:                 config.redis.port,
    password:             process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  });
}

export function getQueue(): Bull.Queue {
  if (!_queue) {
    _queue = new Bull('document-generation', {
      createClient: () => createRedisClient(),
      defaultJobOptions: {
        attempts:  config.queue.retries,
        backoff:   { type: 'exponential', delay: config.queue.backoffDelay },
        removeOnComplete: 100,
        removeOnFail:     200,
      },
    });

    _queue.on('error', (err) => {
      logger.error({ msg: 'Redis/Bull error — switching to in-memory fallback', error: err.message });
      redisAvailable = false;
    });

    _queue.on('waiting', () => {
      void _queue!.getWaitingCount().then(cnt => queueSize.set(cnt));
    });
  }
  return _queue;
}

export async function enqueueDocument(data: {
  documentId: string;
  userId:     string;
  batchId:    string;
}): Promise<void> {
  if (!redisAvailable) {
    inMemoryQueue.push(data);
    logger.warn({ msg: 'Job pushed to in-memory fallback', ...data });
    return;
  }
  await getQueue().add(data);
}