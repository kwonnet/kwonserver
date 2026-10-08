import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
let cached: {
    signature: string;
    client: S3Client;
    bucket: string;
} | undefined;
function storage() {
    const bucket = process.env.MESSAGING_STORAGE_BUCKET;
    const endpoint = process.env.MESSAGING_STORAGE_ENDPOINT;
    const region = process.env.MESSAGING_STORAGE_REGION || (endpoint ? 'auto' : 'us-east-1');
    const accessKeyId = process.env.MESSAGING_STORAGE_ACCESS_KEY_ID, secretAccessKey = process.env.MESSAGING_STORAGE_SECRET_ACCESS_KEY;
    if (!bucket || (!!accessKeyId !== !!secretAccessKey) || (endpoint && !accessKeyId))
        throw Object.assign(new Error('Private messaging storage is not configured'), { code: 'MESSAGING_STORAGE_CONFIG' });
    if (endpoint) {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
            throw new Error('Private messaging storage requires HTTPS');
        if (url.username || url.password)
            throw new Error('Invalid storage endpoint');
    }
    const signature = JSON.stringify([bucket, endpoint, region, accessKeyId, secretAccessKey]);
    if (cached?.signature !== signature) {
        cached?.client.destroy();
        cached = { signature, bucket, client: new S3Client({ region, endpoint, forcePathStyle: !!endpoint, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}) }) };
    }
    return cached!;
}
export function requireMessagingStorage() { storage(); }
export async function messagingUploadGrant(key: string, bytes: number, expiresIn = 300) { const { client, bucket } = storage(); return { url: await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'application/octet-stream', ContentLength: bytes, IfNoneMatch: '*' }), { expiresIn, signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']) }), headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }, expiresIn }; }
export async function messagingDownloadGrant(key: string) { const { client, bucket } = storage(); return { url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: 'application/octet-stream', ResponseContentDisposition: 'attachment', ResponseCacheControl: 'private, no-store' }), { expiresIn: 60 }), expiresIn: 60 }; }
export async function messagingObjectSize(key: string) { const { client, bucket } = storage(); return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength; }
export async function removeMessagingObject(key: string) { const { client, bucket } = storage(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
export async function migrateMessagingObject(key: string, body: Uint8Array) { const { client, bucket } = storage(); await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/octet-stream' })); }
