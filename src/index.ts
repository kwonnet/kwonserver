import "dotenv/config";
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
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
// ip lookup
app.set("trust proxy", true);

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
  console.log(`listening on port: ${port}`);
  // start mongo db
  startMongodb();
  // start cron jobs
  void startCronJobs().catch(error => {
    console.error("Background job startup failed; check database and Redis availability");
    server.close();
    process.exit(1);
  });
});

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.log(err.name, err.message);
});

process.on("unhandledRejection", (err: any) => {
  console.log("UNHANDLED REJECTION! 💥 Shutting down...");
  console.log(err.name, err.message);
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
    void stopCronJobs().then(() => process.exit(0), () => process.exit(1));
  });
}
