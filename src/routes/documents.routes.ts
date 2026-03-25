// ─── src/routes/documents.routes.ts ──────────────────────────────────────────
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { createBatch, getBatchStatus } from '../services/batch.service';
import { DocumentModel } from '../models/document.model';
import { gridFsBucket } from '../services/pdf.service';
import { validateBatch } from '../middleware/validate';
import { childLogger } from '../utils/logger';

export const documentsRouter = Router();

// ── POST /api/documents/batch ─────────────────────────────────────────────────
const createBatchHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userIds } = req.body as { userIds: string[] };
    const batchId = await createBatch(userIds);
    childLogger({ batchId }).info({ msg: 'Batch created via API' });
    res.status(202).json({ batchId, message: 'Batch accepted for processing' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/batch/:batchId ─────────────────────────────────────────
const getBatchHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await getBatchStatus(req.params.batchId);
    if (!result) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/documents/:documentId ───────────────────────────────────────────
const getDocumentHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({
      documentId: req.params.documentId,
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.status !== 'completed' || !doc.gridFsId) {
      res.status(202).json({
        status:  doc.status,
        message: 'Document not ready yet',
      });
      return;
    }

    const objectId = new mongoose.Types.ObjectId(doc.gridFsId.toString());
    const bucket   = gridFsBucket();

    // Vérifie que le fichier existe dans GridFS
    const files = await bucket.find({ _id: objectId }).toArray();
    if (!files.length) {
      res.status(404).json({ error: 'PDF not found in storage' });
      return;
    }

    // Charge le PDF complet en mémoire avant d'envoyer
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = bucket.openDownloadStream(objectId);
      stream.on('data',  (chunk: Buffer) => chunks.push(chunk));
      stream.on('end',   () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    // Envoie d'un seul coup avec tous les headers corrects
    res.writeHead(200, {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${doc.documentId}.pdf"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'no-cache',
    });
    res.end(pdfBuffer);

  } catch (err) {
    next(err);
  }
};


documentsRouter.get('/debug/pdf-direct', ((_req: Request, res: Response) => {
  const PDFDocument = require('pdfkit') as typeof import('pdfkit');
  const doc = new PDFDocument({ margin: 50 });

  res.writeHead(200, {
    'Content-Type':        'application/pdf',
    'Content-Disposition': 'attachment; filename="debug.pdf"',
  });

  doc.pipe(res);
  doc.fontSize(20).text('Test PDF OK', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Généré le ${new Date().toISOString()}`);
  doc.end();
}) as RequestHandler);

documentsRouter.post('/batch',         validateBatch, createBatchHandler);
documentsRouter.get('/batch/:batchId',                getBatchHandler);
documentsRouter.get('/:documentId',                   getDocumentHandler);