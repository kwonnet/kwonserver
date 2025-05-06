import prisma from "@/db"

export const getCryptoWalletAddresses = async() => {
    try {
        const data = await prisma.cryptoAddress.findMany()
        if(data.length === 0){
            return { data: 'Not found', status: 404 }
        }
        return { data, status: 200 }

    } catch (error) {
        return { data: "Error occurred, please try again", status: 500 }
    }
} 
