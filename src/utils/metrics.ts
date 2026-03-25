import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const documentsGeneratedTotal = new Counter({
  name: 'documents_generated_total',
  help: 'Nombre total de documents générés',
  labelNames: ['status'],  
  registers: [register],
});

export const batchDuration = new Histogram({
  name: 'batch_processing_duration_seconds',
  help: 'Durée de traitement d\'un batch',
  buckets: [5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const queueSize = new Gauge({
  name: 'queue_size',
  help: 'Nombre de jobs en attente dans la queue',
  registers: [register],
});

export const pdfGenerationDuration = new Histogram({
  name: 'pdf_generation_duration_seconds',
  help: 'Durée de génération d\'un PDF',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});