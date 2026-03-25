export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongodb: {
    uri: process.env.MONGO_URI ?? 'mongodb://mongo:27017/documents',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'redis',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? '20', 10),
    retries: 3,
    backoffDelay: 1000, // ms (exponentiel : 1s, 2s, 4s)
  },

  pdf: {
    timeoutMs: 5000,
    workerPoolSize: parseInt(process.env.PDF_WORKERS ?? '4', 10),
  },

  docusign: {
    baseUrl: process.env.DOCUSIGN_URL ?? 'https://demo.docusign.net',
  },
};