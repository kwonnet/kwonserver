import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ continent: { findMany: vi.fn() }, tipPackage: { findMany: vi.fn() }, pushNotification: { upsert: vi.fn() } }));
vi.mock('@/utils/webpush', () => ({default: {configure: vi.fn()}}));
vi.mock('@/db', () => ({ default: db }));
import { getContinentsAndCountries } from '@/services/v1/locations';
import { getTipPackages } from '@/services/v1/tips';
const config = {endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url')}};
import { subscribePushNotification } from '@/services/v1/notifications';
beforeEach(() => { for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset(); });
it('loads continents with their countries', async () => {
  db.continent.findMany.mockResolvedValue([{ id: 'AF', countries: [] }]);
  expect((await getContinentsAndCountries()).status).toBe(200);
  expect(db.continent.findMany).toHaveBeenCalledWith({ include: { countries: true } });
});
it('returns 404 when no locations exist', async () => {
  db.continent.findMany.mockResolvedValue([]); expect((await getContinentsAndCountries()).status).toBe(404);
});
it.each([{ packages: [] }, { packages: [{ id: 'tip-1' }] }])('returns tip packages including an empty catalog', async ({ packages }) => {
  db.tipPackage.findMany.mockResolvedValue(packages); expect(await getTipPackages()).toEqual({ status: 200, data: packages });
});
it('binds push subscriptions to the authenticated user', async () => {
  db.pushNotification.upsert.mockResolvedValue({ id: 'sub' });
  expect((await subscribePushNotification(config, { id: 'u' } as any)).status).toBe(200);
  expect(db.pushNotification.upsert).toHaveBeenCalledWith({where: {endpoint: config.endpoint}, create: {endpoint: config.endpoint, config, userId: 'u', sessionId: null}, update: {config, userId: 'u', sessionId: null}});
});
it.each(['locations', 'tips', 'notifications'])('%s handles database failure', async service => {
  db.continent.findMany.mockRejectedValue(new Error('private')); db.tipPackage.findMany.mockRejectedValue(new Error('private'));
  db.pushNotification.upsert.mockRejectedValue(new Error('private'));
  const result = await (service === 'locations' ? getContinentsAndCountries() : service === 'tips' ? getTipPackages() : subscribePushNotification(config, { id: 'u' } as any));
  expect(result.status).toBe(500); expect(result.data).not.toContain('private');
});
