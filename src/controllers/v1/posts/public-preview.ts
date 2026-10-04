import type { Request, Response } from "express";
import { getPublicPostPreview } from "@/services/v1/posts/public-preview";
import logger from "@/logger";

export async function getPublicPostPreviewController(_req: Request, res: Response) {
  // Re-evaluate visibility on every request, including immediately after a privacy change.
  res.setHeader("Cache-Control", "no-store");
  try {
    const posts = await getPublicPostPreview();
    return res.status(200).json(posts);
  } catch {
    logger.warn("Public feed preview unavailable");
    return res.status(503).json({ message: "The feed is temporarily unavailable." });
  }
}
