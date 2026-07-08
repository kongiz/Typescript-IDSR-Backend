import { Request, Response, NextFunction } from "express";
import xss from "xss";

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return obj;

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      obj[key] = xss(value.trim());
    } else if (typeof value === "object" && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
  return obj;
}

export default (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body)   sanitizeObject(req.body);
  if (req.query)  sanitizeObject(req.query   as Record<string, unknown>);
  if (req.params) sanitizeObject(req.params  as Record<string, unknown>);
  next();
};