import mongoose from 'mongoose';
import { Worker, WorkerOptions } from 'worker_threads';
import path from 'path';
import { config } from '../config';
import { getQueue } from '../services/queue.service';
import { DocumentModel } from '../models/document.model';
import { Batch } from '../models/batch.model';
import { gridFsBucket } from '../services/pdf.service';
import { childLogger } from '../utils/logger';
import { documentsGeneratedTotal, pdfGenerationDuration } from '../utils/metrics';
import { Readable } from 'stream';

async function connectDb() {
  await mongoose.connect(config.mongodb.uri);
}


// function runPdfWorker(
//   data: { userId: string; documentId: string; templateData: Record<string, string> }
// ): Promise<Buffer> {
//   return new Promise((resolve, reject) => {
//     const timeout = setTimeout(
//       () => reject(new Error('PDF generation timeout')),
//       config.pdf.timeoutMs
//     );

//     const workerPath = path.resolve(__dirname, './pdf.thread.js'); 
//     const worker = new Worker(workerPath, { workerData: data } as WorkerOptions);

//     worker.on('message', (msg: { success: boolean; buffer?: string; error?: string }) => {
//       clearTimeout(timeout);
//       if (msg.success && msg.buffer) {
//         resolve(Buffer.from(msg.buffer, 'base64'));
//       } else {
//         reject(new Error(msg.error ?? 'Unknown PDF error'));
//       }
//     });

//     worker.on('error', (err) => { clearTimeout(timeout); reject(err); });
//   });
// }

function runPdfWorker(
  data: { userId: string; documentId: string; templateData: Record<string, string> }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('PDF generation timeout')),
      config.pdf.timeoutMs
    );

    // Détection dev/prod via variable d'environnement uniquement
    const isDev = process.env.TS_NODE_DEV === 'true';

    const workerPath = isDev
      ? path.resolve(__dirname, './pdf.thread.ts')
      : path.resolve(__dirname, './pdf.thread.js');

    const workerOptions: WorkerOptions = isDev
      ? { workerData: data, execArgv: ['-r', 'ts-node/register'] }
      : { workerData: data };

    const worker = new Worker(workerPath, workerOptions);

    worker.on('message', (msg: { success: boolean; buffer?: string; error?: string }) => {
      clearTimeout(timeout);
      if (msg.success && msg.buffer) {
        resolve(Buffer.from(msg.buffer, 'base64'));
      } else {
        reject(new Error(msg.error ?? 'Unknown PDF error'));
      }
    });

    worker.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function processDocument(job: { data: { documentId: string; userId: string; batchId: string } }) {
  const { documentId, userId, batchId } = job.data;
  const log = childLogger({ documentId, batchId });
  const end = pdfGenerationDuration.startTimer();

  log.info({ msg: 'Processing document' });

  await DocumentModel.updateOne({ documentId }, { status: 'processing' });

  const pdfBuffer = await runPdfWorker({
    userId,
    documentId,
    templateData: { Nom: `User_${userId}`, Convention: 'CERFA-2024' },
  });


  const bucket = gridFsBucket();
  const uploadStream = bucket.openUploadStream(`${documentId}.pdf`, {
    contentType: 'application/pdf',
    metadata: { documentId, batchId, userId },
  });

  await new Promise<void>((resolve, reject) => {
    Readable.from(pdfBuffer).pipe(uploadStream)
      .on('finish', resolve)
      .on('error', reject);
  });

  await DocumentModel.updateOne(
    { documentId },
    { status: 'completed', gridFsId: uploadStream.id }
  );

 
  await Batch.updateOne(
    { batchId },
    { $inc: { processedCount: 1 }, $push: { documentIds: documentId } }
  );


  const batch = await Batch.findOne({ batchId });
  if (batch && batch.processedCount + batch.failedCount >= batch.totalCount) {
    const finalStatus = batch.failedCount > 0 && batch.processedCount === 0 ? 'failed' : 'completed';
    await Batch.updateOne({ batchId }, { status: finalStatus, completedAt: new Date() });
  }

  end();
  documentsGeneratedTotal.inc({ status: 'success' });
  log.info({ msg: 'Document completed' });
}

async function main() {
  await connectDb();
  const queue = getQueue();

  // queue.process(config.queue.concurrency, async (job) => {
  //   try {
  //     await processDocument(job);
  //   } catch (err) {
  //     await DocumentModel.updateOne(
  //       { documentId: job.data.documentId },
  //       { status: 'failed', error: (err as Error).message, $inc: { retryCount: 1 } }
  //     );
  //     await Batch.updateOne({ batchId: job.data.batchId }, { $inc: { failedCount: 1 } });
  //     documentsGeneratedTotal.inc({ status: 'failure' });
  //     throw err; 
  //   }
  // });


interface JobData {
  documentId: string;
  userId:     string;
  batchId:    string;
}
  childLogger({}).info({ msg: `Queue worker started (concurrency: ${config.queue.concurrency})` });

  process.on('SIGTERM', async () => {
    childLogger({}).info({ msg: 'SIGTERM received — draining queue...' });
    await queue.pause(true);  
    await queue.whenCurrentJobsFinished(); 
    await mongoose.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);