import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let _bucket: GridFSBucket | null = null;

export function gridFsBucket(): GridFSBucket {
  if (!_bucket) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB non connecté');
    _bucket = new GridFSBucket(db, { bucketName: 'pdfs' });
  }
  return _bucket;
}


export function createPdfReadStream(gridFsId: mongoose.Types.ObjectId) {
  return gridFsBucket().openDownloadStream(gridFsId);
}