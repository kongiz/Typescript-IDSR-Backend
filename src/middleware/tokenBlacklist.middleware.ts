import redis from "../config/redis";
import logger from "../config/logger";
import { JwtDecoded } from "../types/jwt";

const blacklistKey = (jti: string): string => `blacklist:${jti}`;

export const blacklistToken = async (decoded: JwtDecoded): Promise<void> => {
  try {
    const { jti, exp } = decoded;
    if (!jti) return;

    const now       = Math.floor(Date.now() / 1000);
    const remaining = exp - now;

    if (remaining > 0) {
      await redis.set(blacklistKey(jti), "1", "EX", remaining);
      logger.info("Token blacklisted", { jti, ttl: remaining });
    }
  } catch (err) {
    logger.error("Blacklist error", { error: (err as Error).message });
  }
};

export const isBlacklisted = async (jti: string): Promise<boolean> => {
  try {
    if (!jti) return false;
    const result = await redis.get(blacklistKey(jti));
    return result === "1";
  } catch (err) {
    logger.error("Blacklist check error", { error: (err as Error).message });
    return false;
  }
};