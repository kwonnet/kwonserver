import { beforeEach, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, country: { findUnique: vi.fn(), findMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
import { updateEditableProfile, getEditableProfile } from '@/services/v1/profile';
import { assertChangeAllowed, assertProfileImage, profileUpdateSchema, PROFILE_CHANGE_INTERVAL } from '@/services/v1/profile/policy';
const now = new Date('2026-10-04T12:00:00Z');
const current = () => ({ id: 'owner', name: 'Owner', username: 'owner', status: 'ACTIVE', deletedAt: null, countryId: 'GB', dateOfBirth: new Date('1990-01-01'), countryChangedAt: null, dateOfBirthChangedAt: null, avatar: null, banner: null });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  db.$transaction.mockImplementation(fn => fn(db)); db.user.findUnique.mockResolvedValue(current());
  db.user.findFirst.mockResolvedValue(null); db.country.findUnique.mockResolvedValue({ id: 'NG' });
  db.user.update.mockImplementation(({ data }) => Promise.resolve({ ...current(), ...data }));
});
it.each(['email', 'password', 'role', 'id', 'countryChangedAt'])('rejects mass assignment of %s', key => {
  expect(profileUpdateSchema.safeParse({ bio: 'Hello', [key]: 'unsafe' }).success).toBe(false);
});
it.each(['2026-02-30', '2027-01-01', '1899-12-31', 'not-a-date'])('rejects invalid DOB %s', dateOfBirth => {
  expect(profileUpdateSchema.safeParse({ dateOfBirth }).success).toBe(false);
});
it('allows clearing optional fields and rejects unsafe website protocols', () => {
  expect(profileUpdateSchema.safeParse({ dateOfBirth: null, countryId: null }).success).toBe(true);
  expect(profileUpdateSchema.safeParse({ website: 'javascript:alert(1)' }).success).toBe(false);
  expect(profileUpdateSchema.safeParse({ username: 'New_Name' }).data?.username).toBe('new_name');
});
it('enforces the exact 30-day boundary', () => {
  expect(() => assertChangeAllowed(new Date(now.getTime() - PROFILE_CHANGE_INTERVAL + 1), 'Country', now)).toThrow();
  expect(() => assertChangeAllowed(new Date(now.getTime() - PROFILE_CHANGE_INTERVAL), 'Country', now)).not.toThrow();
});
it('accepts only own normalized images in the correct folder', () => {
  const owner = createHash('sha256').update('owner').digest('hex');
  const image = `https://media.kwonnet.com/profiles/${owner}/f4251651-9946-4bd4-af50-d8b60b2e13b0.webp`;
  expect(() => assertProfileImage(image, 'owner', 'https://media.kwonnet.com', 'avatar')).not.toThrow();
  expect(() => assertProfileImage(image, 'owner', 'https://media.kwonnet.com', 'banner')).toThrow();
  expect(() => assertProfileImage(image.replace('/profiles/', '/banners/'), 'owner', 'https://media.kwonnet.com', 'banner')).not.toThrow();
  expect(() => assertProfileImage(image.replace('/profiles/', '/media/'), 'owner', 'https://media.kwonnet.com', 'avatar')).toThrow();
  expect(() => assertProfileImage(image, 'other', 'https://media.kwonnet.com', 'avatar')).toThrow();
  expect(() => assertProfileImage(image + '?foo=bar', 'owner', 'https://media.kwonnet.com', 'avatar')).toThrow();
  expect(() => assertProfileImage(image.replace('https:', 'http:'), 'owner', 'https://media.kwonnet.com', 'avatar')).toThrow();
});
it('locks the account before checking cooldowns and stamps independent changes', async () => {
  const profile = await updateEditableProfile('owner', { countryId: 'NG', dateOfBirth: '1992-02-29' });
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.user.findUnique.mock.invocationCallOrder[0]);
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner' }, data: expect.objectContaining({ countryChangedAt: now, dateOfBirthChangedAt: now }) }));
  expect(profile.countryNextChangeAt).toBe('2026-11-03T12:00:00.000Z');
  expect(profile.dateOfBirth).toBe('1992-02-29');
});
it.each([{ countryId: 'NG' }, { dateOfBirth: '1992-02-29' }, { countryId: null }, { dateOfBirth: null }])('blocks changes including removal during cooldown: %j', async changes => {
  db.user.findUnique.mockResolvedValue({ ...current(), countryChangedAt: now, dateOfBirthChangedAt: now });
  await expect(updateEditableProfile('owner', changes)).rejects.toMatchObject({ status: 409 });
  expect(db.user.update).not.toHaveBeenCalled();
});
it('unchanged restricted fields do not block other updates or reset timestamps', async () => {
  db.user.findUnique.mockResolvedValue({ ...current(), countryChangedAt: now, dateOfBirthChangedAt: now });
  await updateEditableProfile('owner', { countryId: 'GB', dateOfBirth: '1990-01-01', bio: 'Updated' });
  const data = db.user.update.mock.calls[0][0].data;
  expect(data.bio).toBe('Updated'); expect(data.countryChangedAt).toBeUndefined(); expect(data.dateOfBirthChangedAt).toBeUndefined();
});
it('country cooldown does not block DOB changes', async () => {
  db.user.findUnique.mockResolvedValue({ ...current(), countryChangedAt: now });
  await expect(updateEditableProfile('owner', { dateOfBirth: '1992-02-29' })).resolves.toMatchObject({ dateOfBirth: '1992-02-29' });
});
it('rejects nonexistent countries', async () => {
  db.country.findUnique.mockResolvedValue(null);
  await expect(updateEditableProfile('owner', { countryId: 'bad' })).rejects.toThrow('valid country');
  expect(db.user.update).not.toHaveBeenCalled();
});
it('rejects username collisions, including races caught by the unique index', async () => {
  db.user.findFirst.mockResolvedValue({ id: 'other' });
  await expect(updateEditableProfile('owner', { username: 'other' })).rejects.toMatchObject({ status: 409 });
  db.user.findFirst.mockResolvedValue(null); db.user.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '6.19.0' }));
  await expect(updateEditableProfile('owner', { username: 'other' })).rejects.toMatchObject({ status: 409 });
});
it('rejects suspended or deleted accounts while permitting private profiles', async () => {
  db.user.findUnique.mockResolvedValue({ ...current(), status: 'SUSPENDED' });
  await expect(updateEditableProfile('owner', { bio: 'Hello' })).rejects.toMatchObject({ status: 403 });
  db.user.findUnique.mockResolvedValue({ ...current(), deletedAt: now });
  await expect(updateEditableProfile('owner', { bio: 'Hello' })).rejects.toMatchObject({ status: 403 });
  db.user.findUnique.mockResolvedValue({ ...current(), status: 'PRIVATE' });
  await expect(updateEditableProfile('owner', { bio: 'Hello' })).resolves.toMatchObject({ bio: 'Hello' });
});
it('returns only editable fields to the owning account', async () => {
  db.user.findFirst.mockResolvedValue(current()); db.country.findMany.mockResolvedValue([]);
  await getEditableProfile('owner');
  const query = db.user.findFirst.mock.calls[0][0];
  expect(query.where.id).toBe('owner'); expect(query.select.password).toBeUndefined(); expect(query.select.email).toBeUndefined();
});

it('preserves unchanged legacy images while rejecting new media-folder assignments', async () => {
  const legacy = 'https://media.kwonnet.com/media/legacy.webp';
  db.user.findUnique.mockResolvedValue({ ...current(), avatar: legacy });
  await expect(updateEditableProfile('owner', { avatar: legacy, bio: 'Hello' })).resolves.toMatchObject({ avatar: legacy });
  await expect(updateEditableProfile('owner', { avatar: legacy + 'new' })).rejects.toThrow('uploaded by your account');
});
