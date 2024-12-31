import { UserStatus, User as PrismaUser, GameAchievement, Prisma } from "@prisma/client";
import { RewardQuery, User } from "@/types";
import prisma from "@/db";

const getMessage = (user: PrismaUser) => {

    const arr = user.metadata[user.metadata.length - 1] as { reason: string, createdAt: string };

    if (user.status === UserStatus.SUSPENDED){
        // show possible number of days
        return  `Your account has been temporarily suspended for ${arr.reason}`
    }
    return  `Your account has been banned for ${arr.reason}`
}

export const handleReferral = async(telRef: {referrerId: string, refereeId: string},dbRefereeId: string) => {
    try {
        console.log("handleReferral", telRef, "referrerId", "db refereeId", dbRefereeId)
        // Check if the user has a record in the Referral model
        const [referee, userReferrer ] = await prisma.$transaction([
            prisma.referral.findFirst({
                where: { referee: { telId: telRef.refereeId }  }
            }),
            prisma.user.findFirst({
                where: { telId: telRef.referrerId   }
            }),
        ])
        // check if the person has been referred already
        if(referee || !userReferrer) return null;
        // create referral object
        const rewardAmount = 50
        const result = await prisma.referral.create({ data: { 
            referrerId: userReferrer?.id, 
            refereeId: dbRefereeId,
            rewardAmount}})
        console.log("Created referral ", result)
        return result
    } catch (error: any) {
        console.log("referral error ", error?.message)
       return null 
    }
}


export const createOrLoginUser = async(user: User, referrerId?: string) => {
    try {
        const { id, ...rest} = user
        const dbUser = await prisma.user.findFirst({ where: { telId: user.telId }})
        if(!dbUser){
            console.log("Currently About to create new user ", user,  )
            console.log("Ref User ", referrerId)
            const newUser = await prisma.user.create({ data: {...rest, email: `${user.telId}@me.com`}})
            if(referrerId && (referrerId !== user.telId)){
                // the new user is the referee
                handleReferral({referrerId, refereeId: newUser.telId}, newUser.id)
            }
            return { data: {...rest, id: newUser.id }, status: 200 }
        }
        if(dbUser.status !== UserStatus.ACTIVE){
            return { data: getMessage(dbUser) , status: 401 }
        }
        return { data: {...rest, id: dbUser.id }, status: 200 }
    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
}  

export const searchUser = async(query: string) => {
    try {
        const user = await prisma.user.findFirst({ where: { OR: [ 
            {id: { endsWith: query, mode: "insensitive"}}, 
            { username: { equals: query, mode: "insensitive"}},
            { email: { equals: query, mode: "insensitive"}}
        ] }})
        if(!user){
            return { data: 'User not found', status: 404 }
        }
        if(user.status !== UserStatus.ACTIVE){
            return { data: getMessage(user) , status: 400 }
        }
        return { data: {id: user.id, username: user.username, avatar: user.avatar, name: user.name }, status: 200 }
    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
}  


export const getUserAchievements = async(query: RewardQuery) => {
    try {
        const { catId, userId, year, page, limit } = query;

        const skip = (page - 1) * limit;

        const whereClause: Prisma.GameAchievementWhereInput = {
            AND: [
              { playerId: userId }, // Always include `userId` since it's required
              ...(catId ? [{ catId }] : []), // Add `catId` condition only if it's not null
              ...(year
                ? [
                    {
                      createdAt: {
                        gte: new Date(`${year}-01-01T00:00:00.000Z`),
                        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
                      },
                    },
                  ]
                : []), // Add `year` condition only if it's not null
            ],
          };
    
        const result = await prisma.gameAchievement.findMany({ 
            where: whereClause,
            skip: skip,
            take: limit
        })
        if(result.length === 0){
            return { data: 'Not found', status: 404 }
        }
        return { data: result, status: 200 }
    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
}

export const getUserStats = async(id: string) => {
    try {

        const [totalInvites, earned, totalAwards, totalTxns, totalTaskNotDone, totalTaskDone  ] = await prisma.$transaction([
            // get total referral
            prisma.referral.count({ where: { referrerId: id}}),
            // get total referral reward amount
            prisma.referral.aggregate({ _sum: { rewardAmount: true}, where: { referrerId: id}}),
            // get total game achievements
            prisma.gameAchievement.count({ where: { playerId: id}}),
            // get total txns
            prisma.transaction.count({ where: { userId: id}}),
            // get total unperformed tasks
            prisma.task.count({
                where: {
                  performedBy: {
                    none: {
                      userId: id,
                    },
                  },
                },
                
              }),
            // get total performed tasks
            prisma.userTask.count({ where: { userId: id } })
        ])
        
        return { data: { totalAwards, totalTxns, totalInvites, totalEarned: earned._sum.rewardAmount ?? 0, totalTaskNotDone, totalTaskDone  }, status: 200 }
    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
}

export const getUserActiveSubscription = async(userId: string) => {
    try {
        const sub = await prisma.subscription.findFirst({ where: { userId, isPrimary: true }, include: { plan: { select: { accountType: true, id: true, createdAt: true, features: true, discount: true, name: true, price: true, tier: true, updatedAt: true}}}})
        if(!sub){
            return { data: 'Not found', status: 404 }
        }
        return { data: sub, status: 200 }
    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
}  








// import bcrypt from "bcrypt";
// import prisma from "@/db";
// import { getRandomNumber } from "@/utils";
// import logger from "@/logger";

// // Function to check if user exists based on email and authenticate or create the user
// export async function authenticateOrCreateUser({ email, password }: {
//   email: string;
//   password: string;
// }) {
//   try {
//     // Check if user exists by email (using email as the unique identifier)
//     const user = await prisma.user.findFirst({ where: { email: { mode: "insensitive", equals: email  }} })
//     if (user) {
//       // Step 3: Validate password (assuming we have a plain password for login)
//       const isPasswordCorrect = await bcrypt.compare(password, String(user.password));
//       if (!isPasswordCorrect) return { data: null, message: "Wrong username/password provided" }; 
//         //   successful authentication
//       return { data: { id: user.id, email: user.email, name: user.name, username: user.name},  message: "Login successful" };
//     } 
//     // Step 4: If the user doesn't exist, create a new user
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const name = email.split('@')[0] 
//     const userObj = { password: hashedPassword, username: name,  email, name }
//     // Create new user
//     const bonus = getRandomNumber(20, 55)
//     const newUser = await prisma.user.create({ data: {...userObj, wallet: { create: { bonus, credit: 0, amount: 0 }} }, });
//     // return newUser
//     return { data: { id: newUser.id, username: newUser.username, name: newUser.name, email: newUser.email}, message: "User created" };
//   } catch (error: any) {
//     logger.error(error?.message);
//     return { data: null, message: "Error creating user"};
//   }
// }
