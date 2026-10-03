import logger from '@/logger';
export async function run() {
  // Retain the scheduler name for old queued jobs. Snapshot writeback is unsafe.
  // Legacy balances must be reconciled during the documented maintenance cutover.
  logger.info('Wallet snapshot writeback disabled; PostgreSQL is authoritative');
}
