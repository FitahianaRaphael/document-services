import mongoose from 'mongoose';
import { logger } from './logger';

let _isConnected = false;

export function watchMongoConnection(): void {
  mongoose.connection.on('connected',    () => { _isConnected = true;  logger.info({ msg: 'MongoDB connected' }); });
  mongoose.connection.on('disconnected', () => { _isConnected = false; logger.warn({ msg: 'MongoDB disconnected — retrying...' }); });
  mongoose.connection.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ msg: 'MongoDB error', error: msg });
  });

  mongoose.connection.on('disconnected', async () => {
    let attempt = 0;
    while (!_isConnected) {
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      logger.warn({ msg: `MongoDB reconnect attempt ${attempt + 1} in ${delay}ms` });
      await new Promise<void>((r) => setTimeout(r, delay));
      try {
        await mongoose.connect(process.env.MONGO_URI ?? 'mongodb://localhost:27017/documents');
      } catch {
        attempt++;
      }
    }
  });
}

export async function withMongoRetry<T>(
  operation: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (err: unknown) {
      const msg     = err instanceof Error ? err.message : String(err);
      const isMongo = msg.includes('buffering timed out') || msg.includes('connection');
      if (!isMongo || i === retries - 1) throw err;
      const delay = 1000 * 2 ** i;
      logger.warn({ msg: `MongoDB op failed, retry ${i + 1}/${retries} in ${delay}ms` });
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw new Error('MongoDB operation failed after retries');
}