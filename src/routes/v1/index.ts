import express from 'express'
import authRoutes from './auth';
import userRoutes from './users';
import gameRoutes from './games';
import coinRoutes from './coins';
import walletRoutes from './wallets';
import taskRoutes from './tasks';
import subscriptionRoutes from './subscriptions';
import cryptoRoutes from './crypto';
import paymentRoutes from './payments';
import telegramRoutes from './telegram';
import imagekitRoutes from './imagekit';
import postRoutes from './posts';
import locationRoutes from './locations';
import notificationsRoutes from './notifications';
import sseEmitter from '@/sseEmitter';
import tipRoutes from './tips';

const router = express.Router();

router.use("/auth/", authRoutes)

router.use("/users/", userRoutes)

router.use("/games/", gameRoutes)

router.use("/coins/", coinRoutes)

router.use("/tips", tipRoutes)

router.use("/wallets/", walletRoutes)

router.use("/subscriptions/", subscriptionRoutes)

router.use("/crypto/", cryptoRoutes)

router.use("/tasks/", taskRoutes)

router.use("/payments/", paymentRoutes)

router.use("/telegram/", telegramRoutes)

router.use("/imagekit/", imagekitRoutes)

router.use("/posts/", postRoutes)

router.use("/locations/", locationRoutes)

router.use("/notifications/", notificationsRoutes)

router.use("/stream", sseEmitter.init)


const v1Routes = router

export default v1Routes;
