import { webpushConfig } from '@/config';
import webpush from 'web-push';
let configured = false;
function configure() {
  if (configured) return;
  if (!webpushConfig?.email || !webpushConfig.publicKey || !webpushConfig.privateKey) throw new Error('VAPID configuration unavailable');
  webpush.setVapidDetails(webpushConfig.email, webpushConfig.publicKey, webpushConfig.privateKey);
  configured = true;
}
export default {
  configure,
  async sendNotification(...args: Parameters<typeof webpush.sendNotification>) {
    configure();
    return webpush.sendNotification(...args);
  },
};
