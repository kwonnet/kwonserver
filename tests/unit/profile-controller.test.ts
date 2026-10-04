import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
const deps = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/services/v1/profile', () => ({ getEditableProfile: deps.get, updateEditableProfile: deps.update }));
import { editableProfileController } from '@/controllers/v1/profile';
import { ProfileError } from '@/services/v1/profile/policy';
beforeEach(() => { vi.resetAllMocks(); });
it('binds reads and updates to the authenticated account', async () => {
  const res = response(); deps.get.mockResolvedValue({ profile: { id: 'owner' } });
  await editableProfileController({ method: 'GET', user: { id: 'owner' }, params: { id: 'victim' } } as any, res);
  expect(deps.get).toHaveBeenCalledWith('owner'); expect(res.headers['Cache-Control']).toBe('private, no-store');
  deps.update.mockResolvedValue({ bio: 'Hello' });
  await editableProfileController({ method: 'PATCH', user: { id: 'owner' }, body: { bio: 'Hello' } } as any, res);
  expect(deps.update).toHaveBeenCalledWith('owner', { bio: 'Hello' });
});
it('rejects unauthenticated updates without touching storage', async () => {
  const res = response(); await editableProfileController({ method: 'PATCH', body: {} } as any, res);
  expect(res.statusCode).toBe(401); expect(deps.update).not.toHaveBeenCalled();
});
it('returns cooldown conflicts and hides internal errors', async () => {
  const req = { method: 'PATCH', user: { id: 'owner' }, body: {} } as any;
  deps.update.mockRejectedValue(new ProfileError('Country cooldown', 409)); const conflict = response();
  await editableProfileController(req, conflict); expect(conflict.statusCode).toBe(409);
  deps.update.mockRejectedValue(new Error('secret database URL')); const failed = response();
  await editableProfileController(req, failed); expect(failed.statusCode).toBe(500); expect(failed.body.error).not.toContain('secret');
});
