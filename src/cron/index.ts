import logger from "@/logger";
import { appSubReminderWorker, appSubscriptionWorker, postEmbeddingWorker } from "./jobs/workers";

export const startCronJobs = async () => {
    try {
      if(!appSubscriptionWorker.isRunning()){
        await appSubscriptionWorker.run();
        logger.info('App Subscription Cron Job Worker Started');
      }
      if(!appSubReminderWorker.isRunning()){
        await appSubReminderWorker.run();
        logger.info('App Subscription Reminder Cron Job Worker Started');
      }
      if(!postEmbeddingWorker.isRunning()){
        await postEmbeddingWorker.run();
        logger.info('Post Embedding Cron Job Worker Started');
      }
    } catch (error: any) {
      logger.error(`Starting cron jobs error - ${error?.message}`);
    }
  }