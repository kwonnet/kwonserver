import { Job, UnrecoverableError } from 'bullmq';
import type { QuestionGenerator } from './generator';
import type { QuestionInventoryService, GenerationJob } from './service';
import logger from '@/logger';
import {logServiceError} from '@/logger/events';
export function generationProcessor(inventory: QuestionInventoryService, generator: QuestionGenerator) {
  return async (job: Job<GenerationJob>) => {
    const start = Date.now();
    const { categoryId } = job.data;
    const category = await inventory.category(categoryId);
    let target = Math.min(inventory.config.maxTarget, job.data.target);
    let noProgress = 0;
    for (let batch = 0; batch < inventory.config.maxBatches; batch++) {
      const current = await inventory.count(categoryId);
      try {
        const demand = await inventory.demand(categoryId);
        if (demand.peakRoomConsumption > 0) target = Math.min(inventory.config.maxTarget,
          Math.max(target, inventory.calculateTargetInventory(current, demand.peakRoomConsumption)));
      } catch (serviceError) {
    logServiceError("questionInventory/processor", "generationProcessor", serviceError);
 logger.warn({ categoryId }, 'Quiz worker demand metrics unavailable'); }
      if (current >= target) return;
      const count = Math.min(inventory.config.batchSize, target - current);
      const generationStart = Date.now();
      const output = await generator.generateBatch({ categoryId, categoryName: category.name,
        context: category.description, topics: category.topics, count });
      if (!Array.isArray(output)) throw new UnrecoverableError('Generator must return a question array');
      const stats = await inventory.insertBatch(categoryId, output.slice(0, count));
      logger.info({ categoryId, targetInventory: target, currentInventory: current, requestedCount: count,
        ...stats, generationDurationMs: Date.now() - generationStart, jobDurationMs: Date.now() - start,
        attempt: job.attemptsMade + 1, priority: job.opts.priority }, 'Quiz inventory batch persisted');
      noProgress = stats.insertedCount ? 0 : noProgress + 1;
      if (noProgress >= 3) throw new UnrecoverableError('Three quiz batches without valid unique questions');
      if (await inventory.count(categoryId) >= target) return;
      await new Promise(resolve => setTimeout(resolve, inventory.config.batchIntervalMs));
    }
    throw new Error('Quiz target not reached within batch budget; retry will resume from PostgreSQL');
  };
}
