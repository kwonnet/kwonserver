
import express from "express";
import { authMiddleware } from "@/middleware";
import { cacheInterceptor } from "@/interceptors"
import { getTrendController } from "@/controllers/v1/discover";


const router = express.Router();

router.get("/trend", authMiddleware({checkPermission: false, required: false}), cacheInterceptor({global: true}), getTrendController)

const discoverRoutes = router

export default discoverRoutes

