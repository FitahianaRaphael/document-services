import mongoose, { Schema, Document as MongoDoc } from 'mongoose';

export type DocStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IDocument extends MongoDoc {
  documentId: string;
  batchId:    string;
  userId:     string;
  status:     DocStatus;
  gridFsId?:  mongoose.Types.ObjectId; // référence au fichier PDF dans GridFS
  error?:     string;
  retryCount: number;
  createdAt:  Date;
  updatedAt:  Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    documentId: { type: String, required: true, unique: true, index: true },
    batchId:    { type: String, required: true, index: true },
    userId:     { type: String, required: true },
    status:     { type: String, enum: ['pending','processing','completed','failed'], default: 'pending' },
    gridFsId:   { type: Schema.Types.ObjectId },
    error:      { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);