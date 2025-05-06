
import express from "express";
import { authMiddleware } from "@/middleware";
import { getContinentsAndCountriesController } from "@/controllers/v1/locations";

const router = express.Router();

router.get("/", authMiddleware(), getContinentsAndCountriesController)

const locationRoutes = router

export default locationRoutes
