import mongoose  from 'mongoose';
import Bull      from 'bull';
import PDFDocument   from 'pdfkit';
import { PassThrough } from 'stream';

import { DocumentModel } from '../models/document.model';
import { Batch }         from '../models/batch.model';
import { gridFsBucket }  from '../services/pdf.service';
import { childLogger }   from '../utils/logger';
import { documentsGeneratedTotal, pdfGenerationDuration } from '../utils/metrics';

// ─── Config inline (évite le singleton partagé avec l'API) ───────────────────
const MONGO_URI   = process.env.MONGO_URI   ?? 'mongodb://localhost:27017/documents';
const REDIS_HOST  = process.env.REDIS_HOST  ?? 'localhost';
const REDIS_PORT  = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY ?? '5', 10);
const PDF_TIMEOUT = 5000;

interface JobData {
  documentId: string;
  userId:     string;
  batchId:    string;
}

// ─── Génération PDF ───────────────────────────────────────────────────────────
function generatePdf(userId: string, documentId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    const pass   = new PassThrough();

    pass.on('data',  (c: Buffer) => chunks.push(c));
    pass.on('end',   () => resolve(Buffer.concat(chunks)));
    pass.on('error', reject);
    doc.pipe(pass);

    const BLUE = '#003189';
    doc.rect(40, 35, 172, 6).fill('#002395');
    doc.rect(212, 35, 172, 6).fillColor('white').stroke();
    doc.rect(384, 35, 171, 6).fill('#ED2939');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE)
       .text("CONTRAT D'APPRENTISSAGE", 220, 45, { align: 'center', width: 335 });
    doc.fontSize(7.5).font('Helvetica').fillColor('#e1000f')
       .text('CERFA N° 13750*05', 220, 60, { align: 'center', width: 335 });

    doc.rect(40, 85, 515, 16).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text("2 — L'EMPLOYEUR", 45, 89);
    doc.fillColor('#212121').font('Helvetica');
    doc.fontSize(6.5).fillColor('#546e7a').text('SIRET', 45, 108);
    doc.fontSize(8).fillColor('#212121').text('83210123400012', 45, 118);
    doc.moveTo(45, 130).lineTo(555, 130).strokeColor('#b0bec5').lineWidth(0.4).stroke();
    doc.fontSize(6.5).fillColor('#546e7a').text('Raison sociale', 310, 108);
    doc.fontSize(8).fillColor('#212121').text('ACME Formation SAS', 310, 118);

    doc.rect(40, 145, 515, 16).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text("3 — L'APPRENTI(E)", 45, 149);
    doc.fontSize(6.5).fillColor('#546e7a').text('Nom', 45, 168);
    doc.fontSize(8).fillColor('#212121').text(`NOM_${userId}`, 45, 178);
    doc.moveTo(45, 190).lineTo(260, 190).strokeColor('#b0bec5').lineWidth(0.4).stroke();
    doc.fontSize(6.5).fillColor('#546e7a').text('Prénom', 310, 168);
    doc.fontSize(8).fillColor('#212121').text(`Prénom_${userId}`, 310, 178);
    doc.moveTo(310, 190).lineTo(555, 190).strokeColor('#b0bec5').lineWidth(0.4).stroke();

    doc.rect(40, 205, 515, 16).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text('4 — CONDITIONS', 45, 209);
    doc.fontSize(6.5).fillColor('#546e7a').text('Date début', 45, 228);
    doc.fontSize(8).fillColor('#212121').text('01/09/2024', 45, 238);
    doc.moveTo(45, 250).lineTo(260, 250).strokeColor('#b0bec5').lineWidth(0.4).stroke();
    doc.fontSize(6.5).fillColor('#546e7a').text('Date fin', 310, 228);
    doc.fontSize(8).fillColor('#212121').text('31/08/2026', 310, 238);
    doc.moveTo(310, 250).lineTo(555, 250).strokeColor('#b0bec5').lineWidth(0.4).stroke();

    doc.rect(40, 265, 515, 16).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text('5 — FORMATION', 45, 269);
    doc.fontSize(6.5).fillColor('#546e7a').text('Diplôme', 45, 288);
    doc.fontSize(8).fillColor('#212121').text('BTS Développement Logiciel', 45, 298);
    doc.moveTo(45, 310).lineTo(555, 310).strokeColor('#b0bec5').lineWidth(0.4).stroke();

    doc.rect(40, 325, 515, 16).fill(BLUE);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text('6 — SIGNATURES', 45, 329);
    for (const x of [45, 215, 385]) {
      doc.rect(x, 345, 155, 55).lineWidth(0.5).strokeColor('#b0bec5').stroke();
    }
    doc.moveTo(40, 415).lineTo(555, 415).lineWidth(0.5).strokeColor('#b0bec5').stroke();
    doc.fontSize(6).fillColor('#546e7a')
       .text(
         `Généré le ${new Date().toLocaleDateString('fr-FR')} — userId: ${userId} — docId: ${documentId}`,
         40, 420, { width: 515, align: 'center' }
       );
    doc.end();
  });
}

// ─── Upload GridFS ────────────────────────────────────────────────────────────
async function uploadToGridFs(
  buffer: Buffer,
  documentId: string,
  batchId: string,
  userId: string
): Promise<mongoose.Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const bucket       = gridFsBucket();
    const uploadStream = bucket.openUploadStream(`${documentId}.pdf`, {
      contentType: 'application/pdf',
      metadata:    { documentId, batchId, userId },
    });
    uploadStream.on('finish', () => resolve(uploadStream.id as mongoose.Types.ObjectId));
    uploadStream.on('error',  reject);
    uploadStream.write(buffer);
    uploadStream.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // 1. MongoDB
  await mongoose.connect(MONGO_URI);
  childLogger({}).info({ msg: 'MongoDB connected (worker)' });

  // 2. Crée la queue DIRECTEMENT ici — même nom que dans queue.service.ts
  const queue = new Bull<JobData>('document-generation', {
    redis: { host: REDIS_HOST, port: REDIS_PORT },
    defaultJobOptions: {
      attempts:  3,
      backoff:   { type: 'exponential', delay: 1000 },
    },
  });

  // 3. Vérifie la connexion Redis
  await queue.isReady();
  childLogger({}).info({ msg: `Redis connected — waiting for jobs...` });

  // 4. Traitement des jobs
  queue.process(CONCURRENCY, async (job) => {
    const { documentId, userId, batchId } = job.data;
    const log      = childLogger({ documentId, batchId });
    const endTimer = pdfGenerationDuration.startTimer();

    log.info({ msg: 'Job received — processing...' });

    await DocumentModel.updateOne({ documentId }, { status: 'processing' });

    // Génération PDF avec timeout
    const pdfBuffer = await Promise.race([
      generatePdf(userId, documentId),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('PDF timeout')), PDF_TIMEOUT)
      ),
    ]);

    log.info({ msg: `PDF generated — ${pdfBuffer.length} bytes` });

    // Upload GridFS
    const gridFsId = await uploadToGridFs(pdfBuffer, documentId, batchId, userId);
    log.info({ msg: `GridFS upload OK — ${gridFsId.toString()}` });

    // Mise à jour document
    await DocumentModel.updateOne(
      { documentId },
      { status: 'completed', gridFsId }
    );

    // Mise à jour batch
    await Batch.updateOne(
      { batchId },
      { $inc: { processedCount: 1 }, $push: { documentIds: documentId } }
    );

    const batch = await Batch.findOne({ batchId });
    if (batch && (batch.processedCount + batch.failedCount) >= batch.totalCount) {
      const finalStatus = batch.processedCount === 0 ? 'failed' : 'completed';
      await Batch.updateOne({ batchId }, { status: finalStatus, completedAt: new Date() });
      log.info({ msg: `Batch ${finalStatus}` });
    }

    endTimer();
    documentsGeneratedTotal.inc({ status: 'success' });
    log.info({ msg: 'Document completed ✓' });
  });

  queue.on('failed', (job, err: Error) => {
    childLogger({ documentId: job.data.documentId }).error({
      msg:   'Job failed',
      error: err.message,
    });
    void DocumentModel.updateOne(
      { documentId: job.data.documentId },
      { status: 'failed', error: err.message }
    );
    void Batch.updateOne(
      { batchId: job.data.batchId },
      { $inc: { failedCount: 1 } }
    );
    documentsGeneratedTotal.inc({ status: 'failure' });
  });

  // 5. Graceful shutdown
  process.on('SIGTERM', () => {
    childLogger({}).info({ msg: 'SIGTERM — draining...' });
    void queue.pause(true).then(async () => {
      await queue.whenCurrentJobsFinished();
      await mongoose.disconnect();
      process.exit(0);
    });
  });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  childLogger({}).error({ msg: 'Worker fatal error', error: msg });
  process.exit(1);
});