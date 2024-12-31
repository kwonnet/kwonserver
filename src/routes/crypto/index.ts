
import express from "express";
import { authMiddleware } from "@/middleware";
import { getWalletAddressesController } from "@/controllers/crypto";

const router = express.Router();

router.get("/addresses", getWalletAddressesController)

export default router
