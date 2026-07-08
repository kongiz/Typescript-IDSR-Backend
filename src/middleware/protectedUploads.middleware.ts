import { Request, Response, NextFunction } from "express";
import path from "path";
import fs   from "fs";
import logger from "../config/logger";

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

export const serveProtectedUpload = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  try {
    const safePath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(UPLOADS_DIR, safePath);

    // Block directory traversal
    if (!filePath.startsWith(UPLOADS_DIR)) {
      logger.warn("Directory traversal attempt blocked", {
        userId:      req.user?.id,
        requestPath: req.path,
        ip:          req.ip,
      });
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: "File not found" });
      return;
    }

    logger.info("Protected file accessed", {
      userId: req.user?.id,
      file:   safePath,
      ip:     req.ip,
      method: req.method,
    });

    res.sendFile(filePath);
  } catch (err) {
    logger.error("Protected upload serve error", { error: (err as Error).message });
    res.status(500).json({ success: false, message: "Server error" });
  }
};