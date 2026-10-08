import "dotenv/config";
import {authProxyTrust} from "@/utils/auth-security";
import {lookup as ipLookup} from "@/utils/ipLocation";
import * as express from "express";
import http from "http";
import app from "./app";
import socketIo from "./socketIo";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import v1Routes from "./routes/v1";
import { startMongodb } from "./db/mongodb";
import gameSocketIo from "./socketIo/gameSocketIo";
import convoSocketIo from "./socketIo/convoSocketIo";
import { bigintConverterMiddleware } from "./middleware";
import { startCronJobs, stopCronJobs } from "./cron";
import logger from '@/logger';

const port = process.env.PORT || 8000;

// cors
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      String(process.env.REMOTE_APP_URL)
    ],
    credentials: true,
  })
);
// Middleware
const regularJson = express.json();
const encryptedMessageJson = express.json({limit: '2mb'});
app.use((req, res, next) => (req.path === '/api/v1/conversations/messages' ? encryptedMessageJson : regularJson)(req, res, next));

app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
// ip lookup
app.set("trust proxy", authProxyTrust());

// app.use(bigintConverterMiddleware())
// set proper headers
app.use(helmet());

// cookies
app.use(cookieParser());

// initialize socket.io
const io = socketIo(server);
// initialize game namespace
gameSocketIo(io);
// initialize conversation(chat) namespace
convoSocketIo(io);
// Routes
app.get("/", (req: express.Request, res: express.Response) => {
  res.send("Hello, server is up & running!");
});

app.use("/api/v1/", bigintConverterMiddleware, v1Routes);

server.listen(port, () => {
  logger.info({event:'server_started',port},'API server listening');
  // Warm the existing geo database in the background, outside the login deadline.
  void ipLookup.warmup();
  // start mongo db
  startMongodb();
  // start cron jobs
  void startCronJobs().catch(error => {
    logger.error({event:'worker_startup_failed',err:error},'Background job startup failed');
    server.close();
    process.exit(1);
  });
});

process.on("uncaughtException", (err) => {
  logger.error({event:'uncaught_exception',err},'Uncaught exception');
});

process.on("unhandledRejection", (err: any) => {
  logger.error({event:'unhandled_rejection',err},'Unhandled promise rejection');
});


// Let BullMQ finish active jobs before a deployment replaces this process.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 30000);
    timeout.unref();
    server.close();
    void stopCronJobs().then(() => process.exit(0), err => {logger.error({event:'shutdown_failed',err},'API background shutdown failed');process.exit(1);});
  });
}
