import { webpushConfig } from '@/config';
import webpush from 'web-push';

webpush.setVapidDetails(
    webpushConfig.email,
    webpushConfig.publicKey,
    webpushConfig.privateKey
);

export default webpush

