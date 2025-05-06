import express from "express";
import { authMiddleware } from "@/middleware";
import { deleteImagekitFile, getImagekitAuthParams } from "@/controllers/v1/imagekit";

const router = express.Router();

router.post("/", authMiddleware(), getImagekitAuthParams)

router.delete("/:fileId", authMiddleware(), deleteImagekitFile)

const imagekitRoutes = router

export default imagekitRoutes
