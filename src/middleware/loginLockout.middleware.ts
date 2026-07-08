import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";
import logger from "../config/logger";

const MAX_ATTEMPTS = 5;
const LOCKOUT_TTL  = 15 * 60;
const ATTEMPT_TTL  = 15 * 60;

const lockoutKey  = (email: string): string => `lockout:${email.toLowerCase()}`;
const attemptsKey = (email: string): string => `attempts:${email.toLowerCase()}`;

export const recordFailedAttempt = async (email: string): Promise<number | undefined> => {
  try {
    const key      = attemptsKey(email);
    const attempts = await redis.incr(key);
    await redis.expire(key, ATTEMPT_TTL);

    if (attempts >= MAX_ATTEMPTS) {
      await redis.set(lockoutKey(email), "1", "EX", LOCKOUT_TTL);
      logger.warn("Account locked due to failed attempts", { email });
    }

    return attempts;
  } catch (err) {
    logger.error("Lockout recordFailedAttempt error", { error: (err as Error).message });
  }
};

export const clearFailedAttempts = async (email: string): Promise<void> => {
  try {
    await redis.del(attemptsKey(email));
    await redis.del(lockoutKey(email));
  } catch (err) {
    logger.error("Lockout clearFailedAttempts error", { error: (err as Error).message });
  }
};

export const checkLockout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const email = req.body.email?.trim().toLowerCase() as string | undefined;
    if (!email) { next(); return; }

    const locked = await redis.get(lockoutKey(email));
    if (locked) {
      const ttl     = await redis.ttl(lockoutKey(email));
      const minutes = Math.ceil(ttl / 60);
      logger.warn("Blocked login attempt on locked account", { email, ip: req.ip });
      res.status(429).json({
        success: false,
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
      });
      return;
    }

    next();
  } catch (err) {
    logger.error("Lockout checkLockout error", { error: (err as Error).message });
    next();
  }
};