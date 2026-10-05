import {expect, it, vi} from 'vitest';
const valid = vi.hoisted(() => vi.fn());
const touch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/v1/auth', () => ({validateAuthSession: valid, touchAuthSession: touch}));
import {registerAuthNamespace, disconnectAuthSession} from '@/utils/auth-session-sockets';
it('guards socket packets and idle sockets, joins only its session room and clears revocation timers', async () => {
 vi.useFakeTimers();
 try {
  let connection: any, packet: any, close: any;
  const disconnect = vi.fn();
  const namespace = {on: (_event: string, fn: any) => {connection = fn;}, in: vi.fn(() => ({disconnectSockets: disconnect}))};
  registerAuthNamespace(namespace as any);
  const socket = {data: {user: {id: 'u', sessionId: 'sid'}}, join: vi.fn(), use: (fn: any) => {packet = fn;}, disconnect: vi.fn(), once: (_event: string, fn: any) => {close = fn;}};
  connection(socket); expect(socket.join).toHaveBeenCalledWith('auth-session:sid');
  valid.mockResolvedValue(true); const next = vi.fn(); await packet([], next); expect(next).toHaveBeenCalledWith();
  valid.mockResolvedValue(false); await packet([], next); expect(socket.disconnect).toHaveBeenCalledWith(true);
  valid.mockRejectedValue(new Error('offline')); await vi.advanceTimersByTimeAsync(30_000); expect(socket.disconnect).toHaveBeenCalledTimes(2);
  disconnectAuthSession('sid'); expect(namespace.in).toHaveBeenCalledWith('auth-session:sid'); expect(disconnect).toHaveBeenCalledWith(true);
  close(); expect(vi.getTimerCount()).toBe(0);
  connection({data: {user: {id: 'legacy'}}, join: vi.fn()}); expect(vi.getTimerCount()).toBe(0);
 } finally {vi.useRealTimers();}
});
