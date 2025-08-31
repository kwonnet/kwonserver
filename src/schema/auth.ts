import z from "zod"


export const SignInSchema = z.object({
    email: z.string({message: "Field must be a string"})
    .toLowerCase()
    .trim(),
    
    password: z.string({message: "Password must be a string"})
    .min(8, {message: "Password must be at least 8 characters"})
    .max(32, "Password must be at most 32 characters")
})


export const SignUpSchema = z.object({
    name: z.string({message: "Name must be a string"})
    .min(1, {message: "Name is required"})
    .toLowerCase()
    .trim(),

    email: z.string({message: "Email must be a string"})
    .email({message: "Email must be valid"})
    .toLowerCase()
    .trim(),

    password: z.string({message: "Password must be a string"})
    .min(8, {message: "Password must be at least 8 characters"})
    .max(32, "Password must be at most 32 characters"),

    refId: z.string({message: "Referrer ID must be a string"}).nullable().optional()
})