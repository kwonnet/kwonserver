import type {Namespace, Socket} from 'socket.io';
import {validateAuthSession, touchAuthSession} from '@/services/v1/auth';
import logger from '@/logger';
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
    const active = async () => {try {return await validateAuthSession(user);} catch (err) {
      logger.warn({event: 'socket_session_verification_unavailable', sessionId: user.sessionId, err}, 'Session verification temporarily unavailable');
      return null;
    }};
    let lastTouch = 0;
    socket.use(async (_packet, next) => {
      const verified = await active();
      if (verified === true) {
        if (Date.now() - lastTouch >= 60_000) {
          lastTouch = Date.now();
          void touchAuthSession(user).catch(() => {});
        }
        next();
      }
      else if (verified === false) {socket.disconnect(true); next(new Error('Session revoked or expired'));}
      else next(new Error('Session verification temporarily unavailable'));
    });
    // Also close idle connections on replicas without a shared Socket.IO adapter.
    const timer = setInterval(() => {void active().then(ok => {if (ok === false) socket.disconnect(true);});}, 30_000);
    timer.unref();
    socket.once('disconnect', () => clearInterval(timer));
  });
}
