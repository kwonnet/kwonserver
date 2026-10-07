import { getContinentsAndCountries } from "@/services/v1/locations"
import { Response } from "express";
import type {Request} from "@/types/express";export const getContinentsAndCountriesController = async(req: Request, res: Response) => {
    try {
        const result = await getContinentsAndCountries()

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(400).send(error?.message)
    }
}
