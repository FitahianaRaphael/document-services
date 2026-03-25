document-service/
├── src/
|   |── benchmark/
|   |   └── bench.ts
│   ├── config/
│   │   └── index.ts
│   ├── models/
│   │   ├── batch.model.ts
│   │   └── document.model.ts
│   ├── routes/
│   │   ├── documents.routes.ts
│   │   ├── health.routes.ts
│   │   └── metrics.routes.ts
│   ├── services/
│   │   ├── batch.service.ts
│   │   ├── pdf.service.ts
│   │   └── queue.service.ts
│   ├── workers/
│   │   ├── pdf.thread.ts    
│   │   └── queue.worker.ts  
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── validate.ts
│   ├── utils/
│   │   ├── circuitBreaker.ts
│   │   ├── logger.ts
│   │   └── metrics.ts
│   ├── app.ts
│   └── index.ts
│   └── bench.ts
├── docker-compose.yml
├── Dockerfile
├── swagger.yaml
├── package.json
└── tsconfig.json