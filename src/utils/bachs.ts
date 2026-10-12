import { createHmac, timingSafeEqual } from 'node:crypto';
import { WalletError } from '@/services/walletLedger';

export function bachsConfigured() {
  return /^sk_(live|sandbox)_/.test(process.env.BACHS_API_KEY ?? '') && !!process.env.BACHS_WEBHOOK_SECRET;
}
export function bachsApiOrigin() {
  const key = process.env.BACHS_API_KEY ?? '';
  if (key.startsWith('sk_sandbox_')) return 'https://sandbox-api.bachs.io';
  if (key.startsWith('sk_live_')) return 'https://api.bachs.io';
  throw new WalletError('Bachs payments are not configured', 503);
}
export async function bachsRequest(path: string, body?: object, idempotencyKey?: string) {
  const response = await fetch(`${bachsApiOrigin()}/v1${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.BACHS_API_KEY}`, Accept: 'application/json',
      ...(body ? {'Content-Type':'application/json'} : {}), ...(idempotencyKey ? {'Idempotency-Key':idempotencyKey} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.ok) throw new WalletError('Bachs could not complete this request. Retry the same checkout.', response.status === 409 ? 409 : 503);
  return response.json();
}
export function bachsCheckoutUrl(value: unknown) {
  if (typeof value !== 'string') throw new WalletError('Invalid Bachs checkout response', 503);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.bachs.io' || url.username || url.password || url.port) throw new WalletError('Invalid Bachs checkout response', 503);
  return url.href;
}
export function verifyBachsSignature(raw: Buffer, signature: string | undefined, timestamp: string | undefined, v2?: string, now = Date.now()) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(raw)) return false;
  let signatures = [signature ?? ''];
  if (v2) {
    const parts = v2.split(',').map(part => part.trim().split('='));
    const times = parts.filter(([key]) => key === 't');
    if (times.length !== 1) return false;
    timestamp = times[0][1]; signatures = parts.filter(([key]) => key === 'v1').map(([,value]) => value);
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  return signatures.some(value => /^[a-f0-9]{64}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, 'hex')));
}
