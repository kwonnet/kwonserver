// src/types/express.d.ts
import "express";

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        telId: string;
        name: string;
        username: string;
        avatar: string;
        email: string;
        userType: "INDIVIDUAL" | "ORGANIZATION" | "GOVERNMENT";
        role: "SUPER" | "ADMIN" | "USER";
        meta: { 
          type: "LEGACY" | "PRO"; 
          status: "ACTIVE" | "INACTIVE" | "PAUSED", 
          color: "blue" | "gold" | "grey" 
        }
      };
    }
  }
}


// declare namespace Express {
//   export interface Request {
//     user?: {
//       id: string,
//       telId: string,
//       name: string,
//       username: string,
//       avatar: string
//     };
//   }
// }
