import { Request, Response, NextFunction } from "express";
import logger from "../config/logger";
import env from "../config/env";

export default (req: Request, res: Response, next: NextFunction): void => {
  if (env.NODE_ENV === "production") {
    if (req.headers["x-forwarded-proto"] !== "https") {
      logger.warn("HTTP redirected to HTTPS", { url: req.originalUrl, ip: req.ip });
      res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
      return;
    }
  }
  next();
};