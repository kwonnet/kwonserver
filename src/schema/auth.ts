import z from "zod"


export const AccountSchema = z.object({
    name: z.string({message: "Name must be a string"}).min(1, {message: "Name is required"}),
    email: z.string({message: "Email must be a string"}).email({message: "Invalid email address"}).toLowerCase().trim(),
    password: z.string({message: "Password must be a string"}).min(8, {message: "Password must be at least 8 characters"}),
    referrerId: z.string({message: "Referrer ID must be a string"}).nullable().optional()
})