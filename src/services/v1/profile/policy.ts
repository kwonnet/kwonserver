import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PROFILE_CHANGE_INTERVAL = 30 * 24 * 60 * 60 * 1000;
export class ProfileError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const nullableText = (max: number) => z.string().trim().max(max).nullable();
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Use 3–30 letters, numbers or underscores').transform(v => v.toLowerCase()).optional(),
  bio: nullableText(500).optional(),
  phone: z.string().trim().regex(/^$|^\+?[0-9 ()-]{7,25}$/, 'Enter a valid phone number').nullable().optional(),
  website: z.union([z.literal(''), z.string().url().max(2048).refine(v => ['https:', 'http:'].includes(new URL(v).protocol), 'Use an HTTP or HTTPS website')]).nullable().optional(),
  avatar: nullableText(2048).optional(),
  banner: nullableText(2048).optional(),
  countryId: z.string().min(1).max(100).nullable().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(v + 'T00:00:00.000Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v && d <= new Date() && d >= new Date('1900-01-01');
  }, 'Enter a valid date of birth between 1900 and today').nullable().optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'No profile changes supplied');

export function assertChangeAllowed(last: Date | null, field: string, now: Date) {
  if (last && now.getTime() < last.getTime() + PROFILE_CHANGE_INTERVAL) {
    throw new ProfileError(`${field} can be changed again on ${new Date(last.getTime() + PROFILE_CHANGE_INTERVAL).toISOString()}.`, 409);
  }
}

// Accept only normalized R2 images uploaded into this account's own directory.
// No remote URL fetching or arbitrary public image URL assignment.
export function assertProfileImage(value: string | null | undefined, userId: string, baseUrl: string, kind: 'avatar' | 'banner') {
  if (!value) return;
  const owner = createHash('sha256').update(userId).digest('hex');
  const base = new URL(baseUrl);
  let url: URL;
  try { url = new URL(value); } catch { throw new ProfileError('Upload a valid profile image.'); }
  const prefix = `${base.pathname.replace(/\/$/, '')}/${kind === 'avatar' ? 'profiles' : 'banners'}/${owner}/`;
  if (url.origin !== base.origin || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith(prefix) || !/^[a-f0-9-]{36}\.webp$/i.test(url.pathname.slice(prefix.length))) {
    throw new ProfileError('Profile images must be uploaded by your account.');
  }
}
