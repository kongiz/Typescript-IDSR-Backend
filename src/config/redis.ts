import Redis from "ioredis";
import logger from "./logger";
import env from "./env";

const redis = new Redis(env.REDIS_URL ?? "redis://127.0.0.1:6379");

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error",   (err: Error) => logger.error("Redis error", { error: err.message }));

export default redis;