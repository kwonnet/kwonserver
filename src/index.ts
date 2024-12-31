import 'dotenv/config'
import express, { Request, Response } from 'express';
import http from "http";
import app from './app';
import socketIo from './socketIo';
import gameRouter from './routes/games';
import cors from "cors"
import { startBreeJob } from './bree';
import { telegramBotListener } from './services/telegram';
import authRouter from './routes/auth'
import coinsRouter from './routes/coins'
import walletAddressRouter from './routes/wallets'
import userRouter from './routes/users';
import subscriptionRouter from './routes/subscriptions';
import cryptoRouter from './routes/crypto';
import taskRouter from './routes/tasks';
import paymentRouter from './routes/payments';
import helmet from 'helmet';
import cookieParser from "cookie-parser"

const port = process.env.PORT || 8000;

const server = http.createServer(app);
// Middleware
app.use(express.json());

app.use(express.urlencoded({ extended: false}));

// ip lookup
app.set('trust proxy', true);

// set proper headers
app.use(helmet());

// cookies
app.use(cookieParser())

// cors
app.use(cors({ origin: [
    'http://localhost:3000', 
    "https://kelvins-macbook-pro.tailb614a8.ts.net",
    "https://725xlp02-3000.usw3.devtunnels.ms"
], credentials: true,  }));

// initialize socket.io
socketIo(server)
// initialize telegram bot
telegramBotListener()
// start breeJob
startBreeJob()
// Routes
app.get('/', (req: Request, res: Response) => {
  res.send('Hello, server is up & running!');
});

app.use("/api/auth/", authRouter)

app.use("/api/users/", userRouter)

app.use("/api/games/", gameRouter)

app.use("/api/coins/", coinsRouter)

app.use("/api/wallets/", walletAddressRouter)

app.use("/api/subscriptions/", subscriptionRouter)

app.use("/api/crypto/", cryptoRouter)

app.use("/api/tasks/", taskRouter)

app.use("/api/payments/", paymentRouter)


server.listen(port, () => {
    console.log(`listening on port: ${port}`);
});




