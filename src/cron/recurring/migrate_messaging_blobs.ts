import {migrateLegacyMessagingBlobs} from '@/services/v1/conversations';
export async function run(){if(process.env.MESSAGING_STORAGE_BUCKET)await migrateLegacyMessagingBlobs();}
