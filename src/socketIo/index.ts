import {validateAuthSession} from "@/services/v1/auth";
import {registerAuthNamespace} from "@/utils/auth-session-sockets";
import { getAuthTokenUser } from "@/utils";
import logger from "@/logger";
import http from "http"
import { Server } from "socket.io";
import { allowedOrigins } from "@/config";


const socketIo = (httpServer: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>) => {
  const io = new Server(httpServer, {
    maxHttpBufferSize: 2 * 1024 * 1024,
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  registerAuthNamespace(io.of("/"));
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error("Unauthenticated user"));
      const user = getAuthTokenUser(token)
      // console.log("Authenticated Socket user ", user)
      if(!user) return next(new Error("Error: Unauthenticated user"));
      if (!await validateAuthSession(user)) return next(new Error("Session revoked or expired"));
      socket.data.user = {...user, name: user.username};
      logger.info(`Socket io Authenticated - ${socket.id}`)
      next();
    } catch (error) {
      console.error("Error authenticating socket user: ", error);
      next(new Error("Error: Unauthenticated user"));
    }
  });

  return io
}

export default socketIo;
