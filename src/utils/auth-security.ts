import {createHmac, timingSafeEqual, createHash, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
function emailTokenKey() {
  const secret = process.env.AUTH_EMAIL_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_EMAIL_TOKEN_SECRET must contain at least 32 characters');
  return createHash('sha256').update(secret).digest();
}
export const hashEmailToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function createEmailToken() {
  const token = randomBytes(32).toString('base64url'), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', emailTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {tokenHash: hashEmailToken(token), encryptedToken: [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.')};
}
export function decryptEmailToken(value: string) {
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', emailTokenKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
}
import {isIP} from 'node:net';
import DeviceDetector from 'node-device-detector';
import type {Request} from 'express';
import {lookup} from '@/utils/ipLocation';
const detector = new DeviceDetector();
export const authProxyTrust = () => (process.env.AUTH_TRUST_PROXY_IPS?.trim() || 'loopback,uniquelocal').split(',').map(x => x.trim()).filter(Boolean);
export function normalizedIp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  let ip = value.trim().toLowerCase();
  if (!isIP(ip)) return null;
  if (isIP(ip) === 6) {
    try {ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);} catch {return null;}
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip);
    if (mapped) {
      const a = Number.parseInt(mapped[1], 16), b = Number.parseInt(mapped[2], 16);
      ip = [a >> 8, a & 255, b >> 8, b & 255].join('.');
    }
  }
  return ip;
}
export function protectedIp(ip: string | null) {
  ip = normalizedIp(ip);
  if (!ip) return {ipAddress: null, ipHash: null};
  let ipAddress: string;
  if (isIP(ip) === 4) ipAddress = ip.split('.').slice(0, 3).join('.') + '.0/24';
  else {
    let ipv6 = ip;
    if (ipv6.includes('.')) {
      const cut = ipv6.lastIndexOf(':');
      const bytes = ipv6.slice(cut + 1).split('.').map(Number);
      ipv6 = ipv6.slice(0, cut + 1) + ((bytes[0] << 8) + bytes[1]).toString(16) + ':' + ((bytes[2] << 8) + bytes[3]).toString(16);
    }
    const [left, right] = ipv6.split('::');
    const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
    const parts = right !== undefined ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
    ipAddress = parts.slice(0, 3).map(part => Number.parseInt(part, 16).toString(16)).join(':') + '::/48';
  }
  const salt = process.env.AUTH_IP_HASH_SECRET;
  return {ipAddress, ipHash: salt && salt.length >= 32 ? createHmac('sha256', salt).update(ip).digest('hex') : null};
}
export function approximateLocation(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const key of ['country', 'countryName', 'country_name', 'continent', 'region', 'region1', 'region2', 'region1_name', 'region2_name', 'regionName', 'city', 'timezone']) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === 'string' && field.trim()) result[key] = field.replace(/[\u0000-\u001f]/g, '').slice(0, 120);
  }
  return Object.keys(result).length ? result : null;
}
export function parseAuthDevice(agent: unknown) {
  const clean = typeof agent === 'string' ? agent.slice(0, 1024) : '';
  try {
    const parsed = detector.detect(clean);
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f]/g, '').slice(0, 64) : null;
    const version = (value: unknown) => typeof value === 'string' && /^[\d.]{1,32}$/.test(value) ? value : null;
    return {browser: text(parsed.client?.name), browserVersion: version(parsed.client?.version), os: text(parsed.os?.name), osVersion: version(parsed.os?.version), type: text(parsed.device?.type) ?? 'unknown'};
  } catch { return {browser: null, browserVersion: null, os: null, osVersion: null, type: 'unknown'}; }
}
export function verifiedWebContext(req: Request) {
  const key = process.env.AUTH_TELEMETRY_SHARED_SECRET;
  const encoded = req.get?.('x-kwonnet-auth-context'), signature = req.get?.('x-kwonnet-auth-signature');
  if (!key || key.length < 32 || !encoded || encoded.length > 4096 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac('sha256', key).update(encoded).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!Number.isSafeInteger(body.at) || Math.abs(Date.now() - body.at) > 60_000 || typeof body.agent !== 'string' || body.agent.length > 1024) return null;
    return {agent: body.agent, ip: normalizedIp(body.ip)};
  } catch { return null; }
}
export async function authRequestMetadata(req: Request) {
  const bridge = verifiedWebContext(req);
  const ip = bridge ? bridge.ip : normalizedIp(req.ip);
  let location = null;
  // No artificial Google DNS fallback and no coordinates retained.
  if (ip && ip !== '::1' && !ip.startsWith('127.') && ip !== '0.0.0.0') {
    try {
      location = approximateLocation(await lookup(ip));
      if (!location && lookup.status) {
        // No full addresses, hashes, agents or provider credentials in diagnostics.
        console.warn('Authentication location unavailable', lookup.status());
      }
    } catch { /* Optional lookup. */ }
  }
  return {device: parseAuthDevice(bridge ? bridge.agent : req.get?.('user-agent')), location,
    ...protectedIp(ip), metadataSource: bridge ? 'SIGNED_WEB' : 'API_REQUEST'};
}
