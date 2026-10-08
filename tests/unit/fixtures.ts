import { vi } from 'vitest';

export function resetMocks(value: any): void {
  if (vi.isMockFunction(value)) value.mockReset();
  else if (value && typeof value === 'object') Object.values(value).forEach(resetMocks);
}

export function response() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.send = vi.fn((body) => { res.body = body; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  res.cookie = vi.fn(() => res);
  res.setHeader = vi.fn((key, value) => { res.headers[key] = value; return res; });
  return res;
}

export function user(overrides: Record<string, unknown> = {}): any {
  return { id: 'user-1', name: 'Ada', username: 'ada', email: 'ada@example.test',
    emailVerifiedAt: new Date('2025-01-01T00:00:00Z'), password: 'hash', status: 'ACTIVE', role: 'USER', userType: 'PERSONAL',
    subscriptions: [], metadata: [], meta: {}, followers: [], following: [],
    country: { id: 'NG', continentId: 'AF' }, createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides };
}

export function post(overrides: Record<string, unknown> = {}): any {
  return { id: 'post-1', userId: 'author-1', type: 'CONTENT', scope: 'ANYONE',
    actions: {}, author: { conn: {} }, tagUsers: [], mentions: [],
    replyCountries: [], replyContinents: [], ...overrides };
}
