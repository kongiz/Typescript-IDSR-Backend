import rateLimit, { ipKeyGenerator, Options, RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";
import logger from "../config/logger";

let redisHealthy = false;

redis.on("connect", () => { redisHealthy = true;  });
redis.on("error",   () => { redisHealthy = false; });
redis.on("close",   () => { redisHealthy = false; });


function makeStore(prefix: string): RedisStore | undefined {
  if (!redisHealthy) return undefined;

  try {
    return new RedisStore({
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<import("rate-limit-redis").RedisReply>,
      prefix:      `rl:${prefix}:`,
    });
  } catch (err) {
    logger.warn(`Rate limiter: could not create Redis store for "${prefix}", using memory`);
    return undefined;
  }
}

const userOrIpKey = (req: Request): string =>
  req.user?.id ? `user_${req.user.id}` : ipKeyGenerator(req as any);


type LimitHandler = Options["handler"];

const onLimitReached = (limiterName: string): LimitHandler =>
  (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    logger.warn("Rate limit hit", {
      limiter:    limiterName,
      userId:     req.user?.id ?? "unauthenticated",
      ip:         req.ip,
      method:     req.method,
      url:        req.originalUrl,
      retryAfter: res.getHeader("Retry-After"),
    });
    res.status(options.statusCode).json(options.message);
  };


export const globalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        1 * 60 * 1000,
  max:             300,
  store:           makeStore("global"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("global"),
  message: { success: false, message: "Too many requests, please slow down" },
});

export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             200,
  keyGenerator:    userOrIpKey,
  store:           makeStore("general"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("general"),
  message: { success: false, message: "Too many requests, please try again later" },
});

export const pollingLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        1 * 60 * 1000,
  max:             60,
  keyGenerator:    userOrIpKey,
  skip:            (req: Request) => !!req.user,
  store:           makeStore("polling"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("polling"),
  message: { success: false, message: "Too many requests, please try again later" },
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  store:           makeStore("auth"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("auth"),
  message: { success: false, message: "Too many login attempts, please try again later" },
});

export const refreshLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             60,
  store:           makeStore("refresh"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("refresh"),
  message: { success: false, message: "Too many token refresh attempts, please try again later" },
});

export const reportSubmitLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  keyGenerator:    userOrIpKey,
  store:           makeStore("report_submit"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("report_submit"),
  message: { success: false, message: "Too many submissions, please wait before submitting again" },
});

export const otpLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  store:           makeStore("otp_request"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("otp_request"),
  message: { success: false, message: "Too many OTP requests, please try again in an hour" },
});

export const otpVerifyLimiter: RateLimitRequestHandler = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  store:           makeStore("otp_verify"),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         onLimitReached("otp_verify"),
  message: { success: false, message: "Too many verification attempts, please try again later" },
});