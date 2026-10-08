import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {createHmac} from 'node:crypto';
import express from 'express';
const mocks = vi.hoisted(() => ({lookup: vi.fn()}));
vi.mock('@/utils/ipLocation', () => ({lookup: mocks.lookup}));
import {authProxyTrust, normalizedIp, protectedIp, approximateLocation, parseAuthDevice, verifiedWebContext, authRequestMetadata} from '@/utils/auth-security';
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
beforeEach(() => {vi.stubEnv('AUTH_TELEMETRY_SHARED_SECRET', 's'.repeat(32)); vi.stubEnv('AUTH_IP_HASH_SECRET', 'h'.repeat(32)); mocks.lookup.mockReset();});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, key = 's'.repeat(32)) {
 const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
 const headers = {'x-kwonnet-auth-context': encoded, 'x-kwonnet-auth-signature': createHmac('sha256', key).update(encoded).digest('hex')};
 return {ip: '198.51.100.10', get: (name: string) => (headers as any)[name]} as any;
}
it('masks IPs and keeps only keyed hashes, never full addresses', () => {
 expect(normalizedIp('::ffff:198.51.100.12')).toBe('198.51.100.12');
 expect(normalizedIp('198.51.100.1, 1.2.3.4')).toBeNull(); expect(normalizedIp(42)).toBeNull();
 expect(protectedIp('198.51.100.12')).toEqual({ipAddress: '198.51.100.0/24', ipHash: expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(protectedIp('2001:db8:abcd:1234::1').ipAddress).toBe('2001:db8:abcd::/48');
 expect(protectedIp('::1').ipAddress).toBe('0:0:0::/48');
 expect(protectedIp('2001:db8::192.0.2.1').ipAddress).toBe('2001:db8:0::/48');
 vi.stubEnv('AUTH_IP_HASH_SECRET', ''); expect(protectedIp('198.51.100.12').ipHash).toBeNull();
 expect(protectedIp(null)).toEqual({ipAddress: null, ipHash: null});
});
it('stores approximate lookup JSON using an allowlist, dropping coordinates, postal details and unknown fields', () => {
 expect(approximateLocation({country: 'NG', city: 'Lagos', region1_name: 'Lagos', timezone: 'Africa/Lagos', latitude: 6, longitude: 3, postcode: '100001', token: 'secret', extra: {password: 'secret'}})).toEqual({country: 'NG', city: 'Lagos', region1_name: 'Lagos', timezone: 'Africa/Lagos'});
 expect(approximateLocation(null)).toBeNull(); expect(approximateLocation([])).toBeNull(); expect(approximateLocation({latitude: 6})).toBeNull();
});
it('parses desktop/mobile browsers and OS without retaining raw agents or hardware identifiers', () => {
 expect(parseAuthDevice(chrome)).toMatchObject({browser: 'Chrome', os: 'Mac', type: 'desktop'});
 expect(parseAuthDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toMatchObject({os: 'iOS', type: 'smartphone'});
 expect(JSON.stringify(parseAuthDevice(chrome))).not.toContain('Mozilla');
 expect(parseAuthDevice(null).type).toBe('unknown');
});
it('accepts only correctly signed, fresh web metadata', () => {
 expect(verifiedWebContext(request({at: Date.now(), ip: '198.51.100.23', agent: chrome}))).toEqual({ip: '198.51.100.23', agent: chrome});
 expect(verifiedWebContext(request({at: Date.now(), agent: chrome}, 'wrong-secret'))).toBeNull();
 for (const body of [{at: Date.now() - 61_000, agent: chrome}, {at: Date.now() + 61_000, agent: chrome}, {at: Date.now(), agent: 42}, {at: Date.now(), agent: 'x'.repeat(1025)}]) expect(verifiedWebContext(request(body))).toBeNull();
 vi.stubEnv('AUTH_TELEMETRY_SHARED_SECRET', ''); expect(verifiedWebContext(request({at: Date.now(), agent: chrome}))).toBeNull();
});
it('uses signed web IP/location or trusted Express metadata, never arbitrary forwarding/location/body fields', async () => {
 mocks.lookup.mockResolvedValue({country: 'NG', city: 'Lagos', latitude: 6, longitude: 3});
 const req = request({at: Date.now(), ip: '198.51.100.23', agent: chrome}); req.body = {password: 'secret', location: {latitude: 8}};
 const meta = await authRequestMetadata(req);
 expect(meta).toMatchObject({ipAddress: '198.51.100.0/24', location: {country: 'NG', city: 'Lagos'}, metadataSource: 'SIGNED_WEB'});
 expect(mocks.lookup).toHaveBeenCalledWith('198.51.100.23'); expect(JSON.stringify(meta)).not.toContain('secret');
 mocks.lookup.mockReset();
 const unknown = await authRequestMetadata(request({at: Date.now(), ip: null, agent: chrome}));
 expect(unknown.ipAddress).toBeNull(); expect(unknown.location).toBeNull(); expect(mocks.lookup).not.toHaveBeenCalled();
 const local = await authRequestMetadata({ip: '::1', get: () => undefined} as any);
 expect(local.location).toBeNull(); expect(mocks.lookup).not.toHaveBeenCalled();
 mocks.lookup.mockRejectedValue(new Error('offline'));
 expect((await authRequestMetadata({ip: '198.51.100.12', get: () => undefined} as any)).location).toBeNull();
});
it('defaults to network-specific proxy trust and permits explicit CIDR configuration', () => {
 vi.stubEnv('AUTH_TRUST_PROXY_IPS', '127.0.0.1/8, 172.18.0.0/16');
 expect(authProxyTrust()).toEqual(['127.0.0.1/8', '172.18.0.0/16']);
 const app = express(); app.set('trust proxy', ['loopback']);
 const req: any = Object.create(app.request); req.app = app; req.headers = {'x-forwarded-for': '1.2.3.4'}; req.socket = {remoteAddress: '198.51.100.12'};
 expect(req.ip).toBe('198.51.100.12'); // Untrusted direct clients cannot spoof XFF.
});

it('encrypts durable auth tokens, stores independent hashes and rejects tampered ciphertext', async () => {
 const {createEmailToken,decryptEmailToken,hashEmailToken}=await import('@/utils/auth-security');
 vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','disposable-secret-with-at-least-32-chars');
 const material=createEmailToken(),plain=decryptEmailToken(material.encryptedToken);
 expect(plain).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(hashEmailToken(plain)).toBe(material.tokenHash);
 expect(material.encryptedToken).not.toContain(plain);expect(createEmailToken().tokenHash).not.toBe(material.tokenHash);
 const parts=material.encryptedToken.split('.');parts[1]=Buffer.alloc(16).toString('base64url');
 expect(()=>decryptEmailToken(parts.join('.'))).toThrow();
});
