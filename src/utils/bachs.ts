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
export async function bachsRequest(path: string, body?: object, idempotencyKey?: string, method?: 'PATCH' | 'DELETE') {
  const response = await fetch(`${bachsApiOrigin()}/v1${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.BACHS_API_KEY}`, Accept: 'application/json',
      ...(body ? {'Content-Type':'application/json'} : {}), ...(idempotencyKey ? {'Idempotency-Key':idempotencyKey} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.ok) throw new WalletError('Bachs could not complete this request. Retry the same checkout.', response.status === 409 ? 409 : 503);
  const result = await response.json();
  return result;
}
// Provider IDs are opaque; do not impose the format used in documentation examples.
export function isBachsCheckoutId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[\s\x00-\x1f\x7f]/.test(value) && value !== '.' && value !== '..';
}
export function bachsCheckoutUrl(value: unknown): string {
  // The API supplies the hosted URL. Its hostname is not part of the API contract.
  if (typeof value !== 'string') throw new WalletError('Bachs did not return a checkout URL',503);
  let url: URL;
  try { url = new URL(value); } catch { throw new WalletError('Bachs returned an invalid checkout URL',503); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new WalletError('Bachs returned an invalid checkout URL',503);
  return value;
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
  // Sign timestamp + raw body and compare without timing leaks.
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  return signatures.some(value => /^[a-f0-9]{64}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, 'hex')));
}

export type BachsPaymentMetadata = {
  collectionCurrency?: string | null;
  paymentMethod: string | null;
  isCrypto: boolean | null;
  cryptoCurrency: string | null;
  cryptoNetwork: string | null;
};
export function isBachsNgnPayment(priceCurrency: unknown, metadata: {collectionCurrency?:unknown;paymentMethod?:unknown} | null) {
  return priceCurrency === 'NGN' || metadata?.collectionCurrency === 'NGN' ||
    typeof metadata?.paymentMethod === 'string' && metadata.paymentMethod.startsWith('NGN_');
}
// Retain payment routing facts only; never copy the complete provider/customer payload.
export function bachsPaymentMetadata(payment: any): BachsPaymentMetadata {
  const text = (value: unknown) => typeof value === 'string' && value.length <= 100 ? value : null;
  const paymentMethod = text(payment?.payment_method)?.toUpperCase() ?? null;
  const crypto = payment?.payment_method_details?.crypto;
  const codes: Record<string,string> = {BNB_BEP20:'BNB Chain (BEP-20)',ETH_ETH:'Ethereum',SOL_SOL:'Solana',USDC_BEP20:'BNB Chain (BEP-20)',USDT_BEP20:'BNB Chain (BEP-20)',USDT_ERC20:'Ethereum (ERC-20)',USDT_SOL:'Solana',USDT_TRC20:'Tron (TRC-20)'};
  const currency = text(crypto?.currency) ?? text(payment?.currency);
  const isCrypto = paymentMethod === 'CRYPTO' || !!codes[currency ?? ''];
  return {paymentMethod,isCrypto:paymentMethod || isCrypto ? isCrypto : null,
    cryptoCurrency:isCrypto ? text(crypto?.asset) ?? (codes[currency ?? ''] ? currency : text(crypto?.currency)) : null,
    cryptoNetwork:isCrypto ? text(crypto?.network) ?? codes[currency ?? ''] ?? null : null};
}
export function validateCryptoRefundAddress(address: unknown, confirmed: unknown): string {
  if (typeof address !== 'string' || address.length < 20 || address.length > 255 ||
      !Array.from(address).every(char => char >= '0' && char <= '9' || char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z'))
    throw new WalletError('Enter a valid crypto refund wallet address',400);
  if (confirmed !== true) throw new WalletError('Confirm that the refund address uses the original payment network',400);
  return address;
}
