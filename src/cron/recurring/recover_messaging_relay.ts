import {dispatchMessagingOutbox} from '@/services/v1/conversations';
export async function run(){for(let batch=0;batch<10;batch++){if(await dispatchMessagingOutbox()<500)break;}}
