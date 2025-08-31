import { SessionUser, AuthUser } from "../user";

declare global {
  namespace Express {
    interface SessionAuthUser {
      user?: SessionUser | AuthUser;
    }
    interface Request extends SessionAuthUser {
      
    }
  }
}

// declare module "express-serve-static-core" {
//   interface SessionAuthUser {
//     user?: AuthUser | AuthUser;
//   }
//   interface Request extends SessionAuthUser {
    
//   }
// }
