import {reconcilePurchaseRefunds} from '@/services/v1/wallets/refunds';
export async function run() {await reconcilePurchaseRefunds();}
