import express from 'express'
// const authRoutes = require('./authRoutes');
// const userRoutes = require('./userRoutes');
// const postRoutes = require('./postRoutes');

const router = express.Router();

// Mount each subfolder's routes
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/posts', postRoutes);


router.use("/auth/", authRouter)

router.use("/users/", userRouter)

router.use("/games/", gameRouter)

router.use("/coins/", coinsRouter)

router.use("/wallets/", walletAddressRouter)

router.use("/subscriptions/", subscriptionRouter)

router.use("/crypto/", cryptoRouter)

router.use("/tasks/", taskRouter)

router.use("/payments/", paymentRouter)

module.exports = router;
