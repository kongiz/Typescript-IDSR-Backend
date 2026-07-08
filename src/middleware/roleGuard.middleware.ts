import { Request, Response, NextFunction } from "express";
import { JwtDecoded } from "../types/jwt";

type Role = JwtDecoded["data"]["role"];

export const requireRole = (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "You are not authorized to access this route" });
      return;
    }
    next();
  };

export const blockRole = (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.role || roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "You are not authorized to access this route" });
      return;
    }
    next();
  };