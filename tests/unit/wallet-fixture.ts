import { vi } from 'vitest';
// Database protocol mock for service unit tests. Real locking/rollback is tested in integration.
export function setupWalletTransaction(db: any) {
  db.$queryRaw = vi.fn().mockResolvedValue([{ id: 'wallet' }]);
  db.walletOperation = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) };
  db.$transaction.mockImplementation((work: any) => typeof work === 'function' ? work(db) : Promise.all(work));
}
