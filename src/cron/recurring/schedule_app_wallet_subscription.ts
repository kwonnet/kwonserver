import prisma from '@/db';
import { insertSubscriptionJob } from '@/cron/utils';

// Reconcile upcoming and overdue subscriptions from PostgreSQL. A creation-time
// cursor misses updated subscriptions and jobs lost during a Redis outage.
export async function run() {
  let cursor: string | undefined;
  for (;;) {
    const subscriptions = await prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAYMENT_ERROR'] }, isRecurring: true, isPrimary: true,
        endDate: { lte: new Date(Date.now() + 48 * 60 * 60 * 1000) },
        transactions: { some: { currency: 'TZX', gateway: 'WALLET', status: 'COMPLETED' } } },
      select: { id: true, userId: true, endDate: true, createdAt: true },
      orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!subscriptions.length) return;
    for (const sub of subscriptions) await insertSubscriptionJob(sub, false);
    cursor = subscriptions[subscriptions.length - 1].id;
  }
}
