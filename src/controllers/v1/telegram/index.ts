import { Request, Response } from "express"

export const getWebhookController = async(req: Request, res: Response) => {
    try {
        console.log(req)
        return res.status(200).send("success")
    } catch (error:any) {
        return res.status(500).send("Error occurred while trying to process request")
    }
}