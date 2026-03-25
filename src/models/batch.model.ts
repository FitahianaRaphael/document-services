import mongoose, { Schema, Document } from 'mongoose';

export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IBatch extends Document {
  batchId: string;
  status: BatchStatus;
  userIds: string[];
  totalCount: number;
  processedCount: number;
  failedCount: number;
  documentIds: string[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema<IBatch>(
  {
    batchId:        { type: String, required: true, unique: true, index: true },
    status:         { type: String, enum: ['pending','processing','completed','failed'], default: 'pending' },
    userIds:        [{ type: String }],
    totalCount:     { type: Number, required: true },
    processedCount: { type: Number, default: 0 },
    failedCount:    { type: Number, default: 0 },
    documentIds:    [{ type: String }],
    startedAt:      { type: Date },
    completedAt:    { type: Date },
  },
  { timestamps: true }
);

export const Batch = mongoose.model<IBatch>('Batch', BatchSchema);