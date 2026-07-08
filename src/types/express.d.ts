import { JwtDecoded } from "./jwt";

export {};

declare global {
  namespace Express {
    interface Request {
      user?:    JwtDecoded["data"];
      decoded?: JwtDecoded;
    }
  }
}