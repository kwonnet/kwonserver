import prisma from '@/db';
import { Prisma, UserStatus } from '@prisma/client';
import { assertChangeAllowed, assertProfileImage, ProfileError, profileUpdateSchema, PROFILE_CHANGE_INTERVAL } from './policy';
import {logServiceError} from '@/logger/events';

export const editableProfileSelect = {
  id: true, name: true, username: true, bio: true, phone: true, avatar: true,
  banner: true, website: true, countryId: true, dateOfBirth: true,
  dateOfBirthChangedAt: true, countryChangedAt: true,
} as const;
export function profileWithPolicy(user: Prisma.UserGetPayload<{ select: typeof editableProfileSelect }>) {
  return { ...user, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    dateOfBirthNextChangeAt: user.dateOfBirthChangedAt ? new Date(user.dateOfBirthChangedAt.getTime() + PROFILE_CHANGE_INTERVAL).toISOString() : null,
    countryNextChangeAt: user.countryChangedAt ? new Date(user.countryChangedAt.getTime() + PROFILE_CHANGE_INTERVAL).toISOString() : null };
}
export async function getEditableProfile(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: { in: [UserStatus.ACTIVE, UserStatus.PRIVATE] } }, select: editableProfileSelect });
  if (!user) throw new ProfileError('Active account not found.', 403);
  const countries = await prisma.country.findMany({ select: { id: true, name: true, iso2: true }, orderBy: { name: 'asc' } });
  return { profile: profileWithPolicy(user), countries };
}
export async function updateEditableProfile(userId: string, body: unknown) {
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) throw new ProfileError(parsed.error.issues.map(i => `${i.path.join('.') || 'Profile'}: ${i.message}`).join('; '));
  const input = parsed.data;
  const base = process.env.CLOUDFLARE_PUBLIC_MEDIA_URL || 'https://media.kwonnet.com';
  try {
    return await prisma.$transaction(async tx => {
      if (input.username) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"username:" + input.username}, 0))`;
      // Serialize edits to enforce cooldowns even for simultaneous requests.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (!current || current.deletedAt || (current.status !== UserStatus.ACTIVE && current.status !== UserStatus.PRIVATE)) throw new ProfileError('Active account not found.', 403);
      const now = new Date();
      const { dateOfBirth, ...otherFields } = input;
      const data: Prisma.UserUncheckedUpdateInput = { ...otherFields };
      for (const field of ['avatar', 'banner'] as const) {
        if (input[field] !== undefined && input[field] !== current[field]) assertProfileImage(input[field], userId, base, field);
      }
      if (input.username && input.username !== current.username) {
        const other = await tx.user.findFirst({ where: { id: { not: userId }, username: { equals: input.username, mode: 'insensitive' } }, select: { id: true } });
        if (other) throw new ProfileError('This username is already taken.', 409);
      }
      if (input.countryId !== undefined && input.countryId !== current.countryId) {
        assertChangeAllowed(current.countryChangedAt, 'Country', now);
        if (input.countryId && !await tx.country.findUnique({ where: { id: input.countryId }, select: { id: true } })) throw new ProfileError('Select a valid country.');
        data.countryChangedAt = now;
      }
      if (dateOfBirth !== undefined) {
        const old = current.dateOfBirth?.toISOString().slice(0, 10) ?? null;
        if (dateOfBirth !== old) {
          assertChangeAllowed(current.dateOfBirthChangedAt, 'Date of birth', now);
          data.dateOfBirthChangedAt = now;
        }
        data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth + 'T00:00:00.000Z') : null;
      }
      for (const field of ['bio', 'phone', 'website', 'avatar', 'banner'] as const) if (data[field] === '') data[field] = null;
      return profileWithPolicy(await tx.user.update({ where: { id: userId }, data, select: editableProfileSelect }));
    });
  } catch (error) {
    logServiceError("v1/profile/index", "updateEditableProfile", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ProfileError('This username is already taken.', 409);
    throw error;
  }
}
