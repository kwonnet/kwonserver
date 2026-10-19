import 'dotenv/config';
import {getMonthlyRewardProgress} from '@/services/walletLedger/monthlyRewardProgress';
import prisma from '@/db';
async function main() {
  try {
    const [year, month] = process.argv.slice(2);
    if (Boolean(year) !== Boolean(month)) throw new Error('Usage: npm run rewards:status -- [year month]');
    console.log(JSON.stringify(await getMonthlyRewardProgress(year ? {year: Number(year), month: Number(month)} : undefined, true), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Unable to read reward progress'); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
const statusRead = main();
