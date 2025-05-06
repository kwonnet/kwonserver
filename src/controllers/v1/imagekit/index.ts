import { imagekitAppName } from "@/config";
import { generateUniqueRef } from "@/utils";
import imagekit from "@/utils/imagekit";
import { Request, Response } from "express";
import { FileObject } from "imagekit/dist/libs/interfaces";

export async function getImagekitAuthParams(req: Request,
  res: Response) {
  try {
    const result = imagekit.getAuthenticationParameters(generateUniqueRef(32));
    console.log("Imagekit result ", result)
    return res.status(200).send(result);
  } catch (error: any) {
    return res.status(500).send(`Authentication request failed: ${error.message}`);
  }
}


export async function deleteImagekitFile(req: Request, res: Response) {
  try {
    const fileId = req.params.fileId;
    if (!fileId) return Response.json("No valid ID provided", { status: 422 });
    if (fileId.includes(imagekitAppName)) {
      const files = await imagekit.listFiles({ name: fileId });
      if (files.length > 0) {
        const file = files[0] as FileObject;
        await imagekit.deleteFile(file.fileId);
      }
    } else {
      await imagekit.deleteFile(fileId);
    }
    return res.send("Media file deleted successfully");
  } catch (error: any) {
    return res.status(500).json(`File deletion request failed: ${error.message}`);
  }
}