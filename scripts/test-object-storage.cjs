// Verify the disposable S3 data path; HTTP 403 alone only proves the API is up.
const {S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');
const {randomUUID} = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const client = new S3Client({
  endpoint: 'http://127.0.0.1:19000', region: 'us-east-1', forcePathStyle: true,
  credentials: {accessKeyId: 'disposable-storage', secretAccessKey: 'disposable-storage-password'},
  requestChecksumCalculation: 'WHEN_REQUIRED', maxAttempts: 1,
});
const Bucket = 'kwonnet-private-test';
const Key = `readiness/${randomUUID()}`;
const Body = Buffer.alloc(128, 5);
const send = command => client.send(command, {abortSignal: AbortSignal.timeout(5000)});
async function check() {
  try {
    await send(new CreateBucketCommand({Bucket}));
  } catch (error) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)) throw error;
  }
  await send(new PutObjectCommand({Bucket, Key, Body, ContentType: 'application/octet-stream'}));
  const result = await send(new GetObjectCommand({Bucket, Key}));
  if (!Buffer.from(await result.Body.transformToByteArray()).equals(Body)) throw new Error('Storage readiness bytes did not match');
  await send(new DeleteObjectCommand({Bucket, Key}));
}
async function main() {
  const deadline = Date.now() + 60000;
  try {
    while (true) {
      try {
        await check();
        console.info('Disposable object storage: upload/read/delete ready');
        return;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        console.warn(`Waiting for disposable object storage: ${error.name}: ${error.message}`);
        await delay(1000);
      }
    }
  } finally {
    client.destroy();
  }
}
main().catch(error => { console.error('Disposable object storage readiness failed:', error); process.exitCode = 1; });
