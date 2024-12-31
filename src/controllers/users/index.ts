import { rewardQuerySchema, SearchUserSchema } from "@/schema/gameSchema"
import { getUserAchievements, getUserActiveSubscription, getUserStats, searchUser } from "@/services/users"
import { AuthUser, RequestWithUser, RewardQuery, User } from "@/types"
import { validateZodInput } from "@/utils"
import { Request, Response } from "express"

export const searchUserController = async(req: Request, res: Response) => {
    try {
        const zodResult = validateZodInput(req.body, SearchUserSchema)

        if(!zodResult.data) return res.status(400).send(zodResult.message)

        const result = await searchUser(zodResult.data.query)

        return res.status(result.status).send(result.data)
    } catch (error:any) {
        return res.status(400).send(error?.message)
    }
}

export const userAchievementsController = async(req: Request, res: Response) => {
    try {
        const zodResult = validateZodInput(req.query as any, rewardQuerySchema)

        if(!zodResult.data) return res.status(400).send(zodResult.message)

        const result = await getUserAchievements(zodResult.data)

        return res.status(result.status).send(result.data)
    } catch (error:any) {
        return res.status(400).send(error?.message)
    }
}

export const userStatsController = async(req: RequestWithUser, res: Response) => {
    try {

        const user = req.user as AuthUser;

        const result = await getUserStats(user?.id)

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(400).send(error?.message)
    }
}

export const userActiveSubscriptionController = async(req: RequestWithUser, res: Response) => {
    try {

        const user = req.user as AuthUser;

        const result = await getUserActiveSubscription(user?.id)

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(400).send(error?.message)
    }
}




