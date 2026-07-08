import { Request, Response, NextFunction } from "express";
import logger from "../config/logger";

export default (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData  = {
      method:    req.method,
      url:       req.originalUrl,
      status:    res.statusCode,
      duration:  `${duration}ms`,
      ip:        req.ip,
      userId:    req.user?.id    ?? "unauthenticated",
      userRole:  req.user?.role  ?? "none",
      userAgent: req.get("user-agent"),
    };

    if (res.statusCode >= 500) {
      logger.error("Server error response", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Client error response", logData);
    } else if (duration > 2000) {
      logger.warn("Slow request detected", logData);
    } else {
      logger.info("Request completed", logData);
    }
  });

  next();
};