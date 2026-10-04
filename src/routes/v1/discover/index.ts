
import express from "express";
import { authMiddleware } from "@/middleware";
import { getTrendController } from "@/controllers/v1/discover";


const router = express.Router();

router.get("/trend", authMiddleware({checkPermission: false, required: false}), getTrendController)

const discoverRoutes = router

export default discoverRoutes

