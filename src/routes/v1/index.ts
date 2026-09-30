import express from 'express'
import authRoutes from './auth';
import userRoutes from './users';
import gameRoutes from './games';
import coinRoutes from './coins';
import walletRoutes from './wallets';
import taskRoutes from './tasks';
import subscriptionRoutes from './subscriptions';

import paymentRoutes from './payments';

import imagekitRoutes from './imagekit';
import postRoutes from './posts';
import locationRoutes from './locations';
import notificationsRoutes from './notifications';
import sseEmitter from '@/sseEmitter';
import tipRoutes from './tips';
import conversationRoutes from './conversations';
import anonymousRoutes from './anonymous';
import discoverRoutes from './discover';

const router = express.Router();

router.use("/auth/", authRoutes)

router.use("/users/", userRoutes)

router.use("/games/", gameRoutes)

router.use("/coins/", coinRoutes)

router.use("/tips", tipRoutes)

router.use("/wallets/", walletRoutes)

router.use("/subscriptions/", subscriptionRoutes)

router.use("/tasks/", taskRoutes)

router.use("/payments/", paymentRoutes)

router.use("/imagekit/", imagekitRoutes)

router.use("/posts/", postRoutes)

router.use("/locations/", locationRoutes)

router.use("/notifications/", notificationsRoutes)

router.use("/conversations/", conversationRoutes)

router.use("/anonymous/", anonymousRoutes)

router.use("/discover/", discoverRoutes)

router.use("/stream", sseEmitter.init)

const v1Routes = router

export default v1Routes;
