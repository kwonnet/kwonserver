import {PrismaPg} from "@prisma/adapter-pg";
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcrypt';
vi.mock('@/utils/webpush', () => ({default: {}}));
import {updateAccountPassword, startAuthSession, validateAuthSession, loginUser} from '@/services/v1/auth';
import {updateEditableProfile} from '@/services/v1/profile';
import {getPublicProfileMetadata} from '@/services/v1/users';
import {getPublicPostMetadata, getPublicPostMetadataIndex, getEmbedPost} from '@/services/v1/posts';
const db = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})}); const prefix = 'account-seo-fixture-'; let owner: string, privateUser: string, current: string, other: string;
beforeAll(async () => {
 owner = (await db.user.create({data: {name: 'Public owner', username: prefix+'owner', email: prefix+'owner@test.invalid', password: await bcrypt.hash('old-password', 10), bio: 'Public bio'}})).id;
 privateUser = (await db.user.create({data: {name: 'Private', username: prefix+'private', email: prefix+'private@test.invalid', isPrivate: true}})).id;
 const metadata = {device: {browser: null, browserVersion: null, os: null, osVersion: null, type: 'unknown'}, location: null, ipAddress: null, ipHash: null, metadataSource: 'API_REQUEST'};
 current = await startAuthSession(owner, 'PASSWORD', metadata); other = await startAuthSession(owner, 'PASSWORD', metadata);
});
afterAll(async () => {await db.post.deleteMany({where: {userId: {in: [owner, privateUser]}}}); await db.user.deleteMany({where: {id: {in: [owner, privateUser]}}}); await db.$disconnect();});
it('verifies password changes, preserves current login, invalidates other logins and supports the new password', async () => {
 expect((await updateAccountPassword(owner, current, {currentPassword: 'wrong-password', newPassword: 'new-password'})).status).toBe(403);
 expect((await updateAccountPassword(owner, current, {currentPassword: 'old-password', newPassword: 'new-password'})).status).toBe(200);
 expect(await validateAuthSession({id: owner})).toBe(false); expect(await validateAuthSession({id: owner, sessionId: current})).toBe(true); expect(await validateAuthSession({id: owner, sessionId: other})).toBe(false);
 expect((await loginUser({email: prefix+'owner@test.invalid', password: 'old-password'})).status).not.toBe(200);
 expect((await loginUser({email: prefix+'owner@test.invalid', password: 'new-password'})).status).toBe(200);
});
it('enforces username uniqueness through the existing profile update service', async () => {
 const results = await Promise.allSettled([updateEditableProfile(owner, {username: 'seo_unique_handle'}), updateEditableProfile(privateUser, {username: 'SEO_UNIQUE_HANDLE'})]);
 expect(results.filter(result => result.status === 'fulfilled'), results.map(result => result.status === 'rejected' ? String(result.reason) : 'ok').join('; ')).toHaveLength(1);
 expect(await db.user.count({where: {username: {equals: 'seo_unique_handle', mode: 'insensitive'}}})).toBe(1);
});
it('returns only public-safe profile and post metadata and sitemap entries', async () => {
 const publicUser = await db.user.findUniqueOrThrow({where: {id: owner}});
 expect(await getPublicProfileMetadata(publicUser.username)).toEqual({name: 'Public owner', username: publicUser.username, bio: 'Public bio', avatar: null});
 const hiddenUser = await db.user.findUniqueOrThrow({where: {id: privateUser}}); expect(await getPublicProfileMetadata(hiddenUser.username)).toBeNull();
 const make = (data: object) => db.post.create({data: {userId: owner, type: 'CONTENT', kind: 'ROOT', content: 'Public text', ...data}});
 const visible = await make({}); const draft = await make({status: 'DRAFT'}); const limited = await make({scope: 'FOLLOWED'}); const hidden = await make({isHidden: true}); const privatePost = await make({userId: privateUser});
 expect(await getPublicPostMetadata(visible.id)).toMatchObject({id: visible.id, content: 'Public text'});
 const embed = await getEmbedPost(visible.id); expect(embed.status).toBe(200); expect(() => JSON.stringify(embed.data)).not.toThrow();
 for (const post of [draft, limited, hidden, privatePost]) {expect(await getPublicPostMetadata(post.id)).toBeNull(); expect((await getEmbedPost(post.id)).status).toBe(404);}
 const ids = (await getPublicPostMetadataIndex()).map(post => post.id); expect(ids).toContain(visible.id);
 for (const post of [draft, limited, hidden, privatePost]) expect(ids).not.toContain(post.id);
});

it('requires genuine recent Google sign-in rather than saved-account switching to set a first password', async () => {
 await db.user.update({where: {id: privateUser}, data: {googleSubject: prefix + 'google-sub'}});
 const metadata = {device: {browser: null, browserVersion: null, os: null, osVersion: null, type: 'unknown'}, location: null, ipAddress: null, ipHash: null, metadataSource: 'API_REQUEST'};
 const switched = await startAuthSession(privateUser, 'GOOGLE', metadata, 'ACCOUNT_SWITCH');
 expect((await updateAccountPassword(privateUser, switched, {newPassword: 'first-password'})).status).toBe(403);
 const signedIn = await startAuthSession(privateUser, 'GOOGLE', metadata, 'SIGN_IN');
 expect((await updateAccountPassword(privateUser, signedIn, {newPassword: 'first-password'})).status).toBe(200);
});
