import { Request, Response } from "express";
import jwt                   from "jsonwebtoken";
import bcrypt                from "bcrypt";
import { randomUUID }        from "crypto";
import db                    from "../config/db";
import logger                from "../config/logger";
import env                   from "../config/env";
import { decryptUserFields } from "../services/userEncryption.service";
import { JwtDecoded }        from "../types/jwt";


interface StoredTokenRow {
  refresh_token: string;
  expiry:        Date;
}

interface RefreshUserRow {
  id:          number;
  role:        string | null;
  region_id:   number | null;
  district_id: number | null;
  [key: string]: unknown;
}

interface RefreshPayload {
  data: { id: number };
  iat:  number;
  exp:  number;
}


export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };

    if (!refresh_token) {
      res.status(400).json({ success: false, message: "Refresh token required" });
      return;
    }

    let decoded: RefreshPayload;
    try {
      decoded = jwt.verify(refresh_token, env.JWT_REFRESH_SECRET) as RefreshPayload;
    } catch {
      res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
      return;
    }

    const userId = decoded.data.id;

    const tokenResult = await db.query<StoredTokenRow>(
      `SELECT refresh_token, expiry FROM user_tokens WHERE user_id = $1`,
      [userId]
    );

    if (tokenResult.rows.length === 0) {
      res.status(401).json({ success: false, message: "Session not found. Please log in again." });
      return;
    }

    const storedToken = tokenResult.rows[0];

    if (new Date(storedToken.expiry) < new Date()) {
      await db.query(`DELETE FROM user_tokens WHERE user_id = $1`, [userId]);
      res.status(401).json({ success: false, message: "Session expired. Please log in again." });
      return;
    }

    
    const tokenMatch = await bcrypt.compare(refresh_token, storedToken.refresh_token);
    if (!tokenMatch) {
      await db.query(`DELETE FROM user_tokens WHERE user_id = $1`, [userId]);
      logger.warn("Refresh token mismatch — possible reuse attack", { userId });
      res.status(401).json({ success: false, message: "Invalid refresh token. Please log in again." });
      return;
    }


    const userResult = await db.query<RefreshUserRow>(
      `SELECT id, role, region_id, district_id FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ success: false, message: "User not found" });
      return;
    }

    const decrypted = decryptUserFields(userResult.rows[0]);
    if (!decrypted) {
      res.status(500).json({ success: false, message: "Server error" });
      return;
    }
    const user = decrypted as unknown as RefreshUserRow;

    // Generate new access and refresh tokens
    
    const issuedAt            = Math.floor(Date.now() / 1000);
    const accessExpirySeconds = parseInt(env.JWT_EXPIRES_IN) * 60 || 3600;

    const tokenData: JwtDecoded["data"] = {
      id:          user.id,
      role:        user.role        as JwtDecoded["data"]["role"],
      region_id:   user.region_id   ?? undefined,
      district_id: user.district_id ?? undefined,
    };

    const newAccessToken = jwt.sign(
      {
        jti:  randomUUID(),
        iat:  issuedAt,
        exp:  issuedAt + accessExpirySeconds,
        data: tokenData,
      },
      env.JWT_ACCESS_SECRET
    );

    const refreshExpirySeconds = parseInt(env.JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60;

    const newRefreshToken = jwt.sign(
      {
        iat:  issuedAt,
        exp:  issuedAt + refreshExpirySeconds,
        data: { id: userId },
      },
      env.JWT_REFRESH_SECRET
    );

    const hashedNewRefresh = await bcrypt.hash(newRefreshToken, 10);
    const newExpiry        = new Date(Date.now() + refreshExpirySeconds * 1000);

    await db.query(
      `UPDATE user_tokens SET refresh_token = $1, expiry = $2 WHERE user_id = $3`,
      [hashedNewRefresh, newExpiry, userId]
    );

    res.status(200).json({
      success:       true,
      access_token:  newAccessToken,
      refresh_token: newRefreshToken,
    });

  } catch (error) {
    logger.error("refreshAccessToken error", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({ success: false, message: "Server error" });
  }
};