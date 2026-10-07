import 'dotenv/config';
import { getQuestionInventory, closeQuestionInventory } from './runtime';
import prisma from '@/db';
import { closeJobQueues } from '@/cron/jobs/queue';
import {logServiceError} from '@/logger/events';
async function main() {
  const [command, categoryId] = process.argv.slice(2);
  if (!categoryId || !['status', 'rebuild', 'ensure'].includes(command)) {
    throw new Error('Usage: npm run quiz:inventory -- <status|rebuild|ensure> <categoryId>');
  }
  const inventory = getQuestionInventory();
  await inventory.queue.waitUntilReady();
  if (command === 'rebuild') await inventory.rebuildCategoryInventory(categoryId);
  if (command === 'ensure') await inventory.ensureInventory(categoryId);
  console.log(JSON.stringify(await inventory.inspect(categoryId), null, 2));
}
void main().catch((serviceError) => {
    logServiceError("questionInventory/cli", "module", serviceError);
 console.error('Quiz inventory command failed; verify arguments and database/Redis access.'); process.exitCode = 1; })
  .finally(async () => { await closeQuestionInventory(); await closeJobQueues(); await prisma.$disconnect(); });
