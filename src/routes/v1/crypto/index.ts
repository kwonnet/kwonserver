
import express from "express";
import { authMiddleware } from "@/middleware";
import { getWalletAddressesController } from "@/controllers/v1/crypto";

const router = express.Router();

router.get("/addresses", getWalletAddressesController)

const cryptoRoutes = router

export default cryptoRoutes
