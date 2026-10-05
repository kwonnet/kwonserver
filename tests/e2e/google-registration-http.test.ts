import {beforeAll, afterAll, expect, it, vi} from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const mocks = vi.hoisted(() => ({verify: vi.fn(), lookup: vi.fn()}));
vi.mock('@/routes/v1', () => ({default: express.Router()}));
vi.mock('@/utils/ipLocation', () => ({lookup: mocks.lookup}));
vi.mock('google-auth-library', () => ({OAuth2Client: class {verifyIdToken = mocks.verify;}}));
import routes from '@/routes/v1/auth';
const db = new PrismaClient();
const prefix = 'google-reg-http-';
let server: http.Server, base: string, countryId: string;
beforeAll(async () => {
 vi.stubEnv('AUTH_GOOGLE_ID', 'google-http-client'); vi.stubEnv('AUTH_TELEMETRY_SHARED_SECRET', 's'.repeat(32));
 const continent = await db.continent.create({data: {id: prefix + 'continent', name: prefix + 'continent', code: 'GX'}});
 const country = await db.country.create({data: {id: prefix + 'country', name: 'Google Registration Fixture', iso2: 'GX', iso3: 'GGX', emoji: '', continentId: continent.id}}); countryId = country.id;
 const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/auth', routes);
 server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
 await new Promise<void>(resolve => server.close(() => resolve()));
 await db.user.deleteMany({where: {email: {startsWith: prefix}}}); await db.country.deleteMany({where: {id: countryId}}); await db.continent.deleteMany({where: {id: prefix + 'continent'}});
 await db.$disconnect(); vi.unstubAllEnvs();
});
it('the real Google controller creates the same user location/country links as password signup', async () => {
 const metadata = Buffer.from(JSON.stringify({at: Date.now(), ip: '198.51.100.42', agent: 'Mozilla/5.0 Chrome/129.0'})).toString('base64url');
 const headers = {'content-type': 'application/json', 'x-kwonnet-auth-context': metadata, 'x-kwonnet-auth-signature': createHmac('sha256', 's'.repeat(32)).update(metadata).digest('hex')};
 mocks.verify.mockResolvedValue({getPayload: () => ({sub: prefix + 'subject', email: prefix + 'new@gmail.com', name: 'New Google', picture: 'https://avatar.invalid/new.png', email_verified: true})});
 mocks.lookup.mockResolvedValue({country: 'GX', city: 'Fixture City', timezone: 'Africa/Lagos', latitude: 6, longitude: 3});
 const response = await fetch(base + '/auth/google', {method: 'POST', headers, body: JSON.stringify({idToken: 'valid-mocked-google-id-token'})});
 expect(response.status).toBe(200); const account: any = await response.json();
 const stored = await db.user.findUniqueOrThrow({where: {id: account.user.id}, include: {location: true}});
 expect(stored.countryId).toBe(countryId); expect(stored.location?.userId).toBe(stored.id);
 expect(stored.location?.meta).toEqual({country: 'GX', city: 'Fixture City', timezone: 'Africa/Lagos'});
 expect(account.user.country.id).toBe(countryId); expect(mocks.lookup).toHaveBeenCalledOnce();
 const event = await db.loginEvent.findFirstOrThrow({where: {userId: stored.id}});
 expect(event.location).toEqual(stored.location?.meta);
 const password = await fetch(base + '/auth/signup', {method: 'POST', headers, body: JSON.stringify({name: 'Password Signup', email: prefix + 'password@example.invalid', password: 'Test-password-42'})});
 expect(password.status).toBe(200); const created: any = await password.json();
 const passwordStored = await db.user.findUniqueOrThrow({where: {id: created.user.id}, include: {location: true}});
 expect(passwordStored.countryId).toBe(countryId); expect(passwordStored.location?.meta).toEqual(stored.location?.meta);
});


