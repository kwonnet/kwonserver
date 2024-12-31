export {};

declare global {
  // you can use typical basic types
  // or you can use classes, interfaces, object types, etc.
  namespace PrismaJson {

    type UserMeta = { type: "LEGACY" | "PRO"; status: "ACTIVE" | "INACTIVE" | "PAUSED" | "REVIEW", color: "blue" | "gold" | "grey"};

    type PlanTier = { id: string,  name: string, price: number, message: string }

    type ItemFeature = { id: string, title: string, description: string | boolean, [key: string]: any }
  }
}

