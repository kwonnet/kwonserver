import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ continent: { findMany: vi.fn() }, tipPackage: { findMany: vi.fn() }, pushNotification: { create: vi.fn() } }));
vi.mock('@/db', () => ({ default: db }));
import { getContinentsAndCountries } from '@/services/v1/locations';
import { getTipPackages } from '@/services/v1/tips';
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
  const config = { endpoint: 'https://push.invalid', keys: { p256dh: 'key' } };
  db.pushNotification.create.mockResolvedValue({ id: 'sub' });
  expect((await subscribePushNotification(config, { id: 'u' } as any)).status).toBe(200);
  expect(db.pushNotification.create).toHaveBeenCalledWith({ data: { config, userId: 'u' } });
});
it.each(['locations', 'tips', 'notifications'])('%s handles database failure', async service => {
  db.continent.findMany.mockRejectedValue(new Error('private')); db.tipPackage.findMany.mockRejectedValue(new Error('private'));
  db.pushNotification.create.mockRejectedValue(new Error('private'));
  const result = await (service === 'locations' ? getContinentsAndCountries() : service === 'tips' ? getTipPackages() : subscribePushNotification({}, { id: 'u' } as any));
  expect(result.status).toBe(500); expect(result.data).not.toContain('private');
});
