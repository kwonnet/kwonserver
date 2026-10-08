import { createClient } from 'redis';
import logger from '@/logger';
import { z } from 'zod/v3';
const CHANNEL = 'kwonnet:messaging:hints:v1';
export const hintSchema = z.object({ conversationId: z.string().uuid(), deviceId: z.string().uuid() }).strict();
export type MessagingHint = z.infer<typeof hintSchema>;
let publisher: ReturnType<typeof createClient> | undefined;
function messagingPublisher() {
    if (!publisher) {
        publisher = createClient({ url: process.env.REDIS_URL, name: 'kwonserver:messaging:publisher', disableOfflineQueue: true });
        publisher.on('error', err => logger.warn({ event: 'messaging_publish_connection_failed', err }, 'Messaging publisher connection unavailable'));
        void publisher.connect().catch(err => logger.warn({ event: 'messaging_publish_connect_failed', err }, 'Messaging publisher will reconnect'));
    }
    return publisher;
}
export async function publishMessagingHints(hints: MessagingHint[]) { if (hints.length) {
    const client = messagingPublisher();
    if (!client.isReady)
        throw new Error('Messaging publisher is reconnecting');
    await client.publish(CHANNEL, JSON.stringify(hints));
} }
export async function closeMessagingPublisher() { if (publisher) {
    publisher.destroy();
    publisher = undefined;
} }
export async function subscribeMessagingHints(listener: (hints: MessagingHint[]) => void) {
    messagingPublisher();
    const subscriber = createClient({ url: process.env.REDIS_URL, name: 'kwonserver:messaging:subscriber', disableOfflineQueue: true });
    subscriber.on('error', err => logger.warn({ event: 'messaging_pubsub_unavailable', err }, 'Messaging pubsub unavailable; clients retain catch-up'));
    await subscriber.connect();
    await subscriber.subscribe(CHANNEL, body => { try {
        listener(z.array(hintSchema).max(1000).parse(JSON.parse(body)));
    }
    catch (error) {
        logger.warn({ event: 'messaging_hint_invalid', err: error }, 'Discarded invalid messaging hint');
    } });
    return async () => { await subscriber.unsubscribe(CHANNEL); await subscriber.quit(); };
}
