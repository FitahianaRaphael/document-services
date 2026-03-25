import { v4 as uuidv4 } from 'uuid';
import { Batch } from '../models/batch.model';
import { DocumentModel } from '../models/document.model';
import { enqueueDocument } from './queue.service';
import { batchDuration } from '../utils/metrics';
import { childLogger } from '../utils/logger';


// ==========================
// ✅ TYPES (IMPORTANT)
// ==========================

type DocumentStatus = {
  documentId: string
  userId: string
  status: string
  error?: string
  createdAt?: Date
}

type BatchStatus = {
  batchId: string
  userIds: string[]
  totalCount: number
  status: string
  startedAt?: Date
  documents: DocumentStatus[]
}


// ==========================
// ✅ CREATE BATCH
// ==========================

export async function createBatch(userIds: string[]): Promise<string> {
  const batchId = uuidv4();
  const log = childLogger({ batchId });
  const endTimer = batchDuration.startTimer();

  await Batch.create({
    batchId,
    userIds,
    totalCount: userIds.length,
    status: 'pending',
  });

  const docs = userIds.map((userId) => ({
    documentId: uuidv4(),
    batchId,
    userId,
    status: 'pending',
  }));

  await DocumentModel.insertMany(docs);

  await Batch.updateOne(
    { batchId },
    { status: 'processing', startedAt: new Date() }
  );

  await Promise.all(
    docs.map((d) =>
      enqueueDocument({
        documentId: d.documentId,
        userId: d.userId,
        batchId,
      })
    )
  );

  log.info({ msg: `Batch created — ${userIds.length} jobs enqueued` });
  endTimer();

  return batchId;
}


// ==========================
// ✅ GET BATCH STATUS (FIX TS7056)
// ==========================

export async function getBatchStatus(batchId: string): Promise<BatchStatus | null> {
  
  const batch = await Batch.findOne({ batchId }).lean<BatchStatus>();

  if (!batch) return null;

  const documents = await DocumentModel.find({ batchId })
    .select('documentId userId status error createdAt')
    .lean<DocumentStatus[]>();

  return {
    ...batch,
    documents
  };
}