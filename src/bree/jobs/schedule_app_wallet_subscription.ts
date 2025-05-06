import { getLastScheduledJob, insertSubscriptionJob } from "@/cron/utils";
import prisma from "@/db";
import logger from "@/logger";
import { SubStatusEnum, TxnCurrencyEnum } from "@prisma/client";

(async () => {
  try {
    const lastScheduledJobDate = (await getLastScheduledJob()) || new Date(0); // Fallback to epoch if Redis is empty
    // Fetch subscriptions to schedule
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: SubStatusEnum.ACTIVE,
        isRecurring: true,
        isPrimary: true,
        transactions: { some: { currency: TxnCurrencyEnum.TZX} },
        createdAt: { gt: lastScheduledJobDate },
      },
      select: { id: true,  userId: true, endDate: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }],
    });

    logger.info(subscriptions, "subscriptions: ")

    for (const sub of subscriptions) {
      await insertSubscriptionJob(sub)
      logger.info(`Scheduled jobs for sub ${sub.id}`);
    }
    // Update the last scheduled job time
    // if (subscriptions.length > 0) {
    //   const lastJobDate = subscriptions[subscriptions.length - 1].createdAt;
    //   await updateLastScheduledJob(lastJobDate);
    // }
    process.exit(0);
  } catch (error: any) {
    logger.error(`Error scheduling app sub jobs ~ ${error.message}`);
    process.exit(1);
  }
})();
