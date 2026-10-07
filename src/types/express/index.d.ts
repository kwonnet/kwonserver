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

/** Routes use scalar named parameters; no array-valued wildcard routes. */
export type Request = import("express").Request<Record<string, string>>;
