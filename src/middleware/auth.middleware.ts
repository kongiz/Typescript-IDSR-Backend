import { Request, Response, NextFunction } from "express";
import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { ZodError } from "zod";
import { isBlacklisted } from "./tokenBlacklist.middleware";
import { jwtPayloadSchema } from "../types/jwt";
import logger from "../config/logger";
import env from "../config/env";

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Authorization header missing or malformed" });
    return;
  }

  const token = header.split(" ")[1];

  try {
    const raw     = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const decoded = jwtPayloadSchema.parse(raw);

    if (await isBlacklisted(decoded.jti)) {
      res.status(401).json({ success: false, message: "Token has been revoked" });
      return;
    }

    req.user    = decoded.data;
    req.decoded = decoded;
    next();

  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ success: false, message: "Token has expired" });
      return;
    }
    if (err instanceof JsonWebTokenError || err instanceof ZodError) {
      res.status(401).json({ success: false, message: "Invalid token" });
      return;
    }
    logger.error("Unexpected error in verifyToken", { error: err });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export default verifyToken;