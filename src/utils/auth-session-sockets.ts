import type {Namespace, Socket} from 'socket.io';
import {validateAuthSession, touchAuthSession} from '@/services/v1/auth';
const namespaces = new Set<Namespace>();
export function disconnectAuthSession(id: string) {
  for (const ns of namespaces) ns.in('auth-session:' + id).disconnectSockets(true);
}
export function registerAuthNamespace(ns: Namespace) {
  namespaces.add(ns);
  ns.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    if (!user?.sessionId) return;
    void socket.join('auth-session:' + user.sessionId);
    const active = async () => {try {return await validateAuthSession(user);} catch {return false;}};
    let lastTouch = 0;
    socket.use(async (_packet, next) => {
      if (await active()) {
        if (Date.now() - lastTouch >= 60_000) {
          lastTouch = Date.now();
          void touchAuthSession(user).catch(() => {});
        }
        next();
      }
      else {socket.disconnect(true); next(new Error('Session revoked or expired'));}
    });
    // Also close idle connections on replicas without a shared Socket.IO adapter.
    const timer = setInterval(() => {void active().then(ok => {if (!ok) socket.disconnect(true);});}, 30_000);
    timer.unref();
    socket.once('disconnect', () => clearInterval(timer));
  });
}
